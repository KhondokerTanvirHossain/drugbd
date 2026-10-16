package com.niramoy.bddrug.adapter.persistence;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.SeniorReviewPort;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.IngredientSummary;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SeniorViews;
import com.niramoy.bddrug.domain.SourceLinks;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Senior review SQL (§7.7). Held products come from the latest current item only (statusOf semantics, PO D7). */
@Component
public class R2dbcSeniorReviewAdapter implements SeniorReviewPort {
    static final String LATEST = "latest AS (SELECT DISTINCT ON (concept_id) batch_id, concept_id, review, note, extracted_at "
        + "FROM ops.batch_item ORDER BY concept_id, extracted_at DESC NULLS LAST, batch_id DESC)";

    protected final DatabaseClient db;
    protected final IngredientSummaryReader ingredients;
    protected final PairReviewReader pairReviews;
    protected final TransactionalOperator tx;
    protected final ObjectMapper json;
    public R2dbcSeniorReviewAdapter(DatabaseClient db, IngredientSummaryReader ingredients, PairReviewReader pairReviews,
                                    TransactionalOperator tx, ObjectMapper json) {
        this.db = db;
        this.ingredients = ingredients;
        this.pairReviews = pairReviews;
        this.tx = tx;
        this.json = json;
    }

    private static Instant at(OffsetDateTime t) { return t == null ? null : t.toInstant(); }
    private static String[] arr(Collection<String> c) { return c.stream().distinct().toArray(String[]::new); }

    /**
     * Narrow, unordered rows (one per held product and ingredient); the substance and clinical-drug facts are looked up by key
     * in two small queries. No ORDER BY: Task 7b measured an ORDER BY on the collated trade name over every held product
     * (it spilled to disk) against the §10.6 300 ms p95; the service orders only the lists it shows (BRAND_ORDER).
     */
    @Override public Mono<List<HeldRow>> held() {
        Mono<List<Narrow>> rows = db.sql("WITH " + LATEST + """
                SELECT l.batch_id, l.concept_id, coalesce(bp.trade_name, l.concept_id) AS trade_name, bp.bdc_id, bpi.xm_code
                FROM latest l
                LEFT JOIN curated.brand_product bp ON bp.concept_id = l.concept_id
                LEFT JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                WHERE l.note IS DISTINCT FROM '%s'""".formatted(ReviewSql.REMOVED_NOTE))
            .map(r -> new Narrow(r.get(0, String.class), r.get(1, String.class), r.get(2, String.class), r.get(3, String.class),
                r.get(4, String.class)))
            .all().collectList();
        return rows.flatMap(list -> {
            String[] xm = list.stream().map(Narrow::xmCode).filter(Objects::nonNull).distinct().toArray(String[]::new);
            String[] bdc = list.stream().map(Narrow::bdcId).filter(Objects::nonNull).distinct().toArray(String[]::new);
            return Mono.zip(xmFacts(xm), clinical(bdc)).map(t -> heldRows(list, t.getT1(), t.getT2()));
        });
    }

    private record Narrow(String batchId, String conceptId, String tradeName, String bdcId, String xmCode) {}
    private record XmFact(String bdsId, String substance, String coverage) {}
    private record Clinical(String displayName, String route) {}

    private static List<HeldRow> heldRows(List<Narrow> rows, Map<String, XmFact> facts, Map<String, Clinical> clinical) {
        List<HeldRow> out = new ArrayList<>(rows.size());
        for (Narrow n : rows) {
            XmFact f = n.xmCode() == null ? null : facts.get(n.xmCode());
            Clinical c = n.bdcId() == null ? null : clinical.get(n.bdcId());
            out.add(new HeldRow(n.conceptId(), n.batchId(), n.tradeName(), n.bdcId(), c == null ? null : c.displayName(),
                c == null ? null : c.route(), n.xmCode(), f == null ? null : f.bdsId(), f == null ? null : f.substance(),
                f == null ? null : f.coverage()));
        }
        return out;
    }

    /** The substance, its name and its coverage behind each XM code (one query). */
    private Mono<Map<String, XmFact>> xmFacts(String[] xmCodes) {
        if (xmCodes.length == 0) return Mono.just(Map.of());
        return db.sql("""
                SELECT xm.code, xm.bds_id, s.preferred_name, coalesce(ic.coverage, 'not_run') AS coverage
                FROM curated.substance_code xm
                LEFT JOIN curated.substance s ON s.bds_id = xm.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = xm.bds_id
                WHERE xm.system = 'ICD11_XM' AND xm.code = ANY(:codes)""")
            .bind("codes", xmCodes)
            .map(r -> Map.entry(r.get(0, String.class), new XmFact(r.get(1, String.class), r.get(2, String.class), r.get(3, String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** Display name and route of each clinical drug (one query). */
    private Mono<Map<String, Clinical>> clinical(String[] bdcIds) {
        if (bdcIds.length == 0) return Mono.just(Map.of());
        return db.sql("SELECT bdc_id, display_name, route FROM curated.clinical_drug WHERE bdc_id = ANY(:ids)")
            .bind("ids", bdcIds)
            .map(r -> Map.entry(r.get(0, String.class), new Clinical(r.get(1, String.class), r.get(2, String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** Read beside held() (not after it): the substances are found in SQL, so no rows travel twice. */
    @Override public Mono<List<Code>> heldDdinterCodes() {
        return db.sql("WITH " + LATEST + """
                SELECT dd.bds_id, dd.code, dd.route_scope FROM curated.substance_code dd
                WHERE dd.system = 'DDINTER' AND dd.bds_id IN (
                  SELECT xm.bds_id FROM curated.substance_code xm
                  JOIN curated.brand_product_ingredient bpi ON bpi.xm_code = xm.code
                  JOIN latest l ON l.concept_id = bpi.concept_id
                  WHERE xm.system = 'ICD11_XM' AND l.note IS DISTINCT FROM '%s')
                ORDER BY dd.bds_id COLLATE "C", dd.code COLLATE "C\"""".formatted(ReviewSql.REMOVED_NOTE))
            .map(r -> new Code(r.get(0, String.class), r.get(1, String.class), r.get(2, String.class)))
            .all().collectList();
    }

    @Override public Mono<List<PairLite>> pairsAmong(Collection<String> codes) {
        if (codes.isEmpty()) return Mono.just(List.of());
        return db.sql("SELECT ddinter_a, ddinter_b, severity FROM curated.ddinter_pair WHERE ddinter_a = ANY(:c) AND ddinter_b = ANY(:c)")
            .bind("c", arr(codes))
            .map(r -> new PairLite(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("severity", String.class)))
            .all().collectList();
    }

    @Override public Mono<List<BatchPairs.PairRow>> pairDetails(List<String> as, List<String> bs) {
        if (as.isEmpty()) return Mono.just(List.of());
        if (as.size() != bs.size()) throw new IllegalArgumentException("pairDetails: as and bs must be aligned");
        return db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.partner_name_a, p.partner_name_b, p.severity, p.actions, t.interaction, t.management,
                       p.interaction_id
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE (p.ddinter_a, p.ddinter_b) IN (SELECT * FROM unnest(:as::text[], :bs::text[]))""")
            .bind("as", as.toArray(String[]::new)).bind("bs", bs.toArray(String[]::new))
            .map(R2dbcReviewQueryAdapter::pairRow).all().collectList();
    }

    @Override public Mono<Map<String, List<PairReviewRule.Decision>>> reviews(Collection<String> codes, String viewerEmail) {
        return pairReviews.forCodes(codes, viewerEmail);
    }

    @Override public Mono<Map<String, EntryInfo>> entries(Collection<String> codes) {
        if (codes.isEmpty()) return Mono.just(Map.of());
        return db.sql("SELECT ddinter_id, name, fetched_at FROM curated.ddinter_drug WHERE ddinter_id = ANY(:ids)")
            .bind("ids", arr(codes))
            .map(r -> Map.entry(r.get("ddinter_id", String.class),
                new EntryInfo(r.get("name", String.class), at(r.get("fetched_at", OffsetDateTime.class)))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    @Override public Mono<Map<String, ItemState>> itemStates(Collection<String> itemKeys) {
        if (itemKeys.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT batch_id, concept_id, review, extracted_at FROM ops.batch_item
                WHERE (batch_id, concept_id) IN (SELECT * FROM unnest(:b::text[], :c::text[]))""")
            .bind("b", batches(itemKeys)).bind("c", concepts(itemKeys))
            .map(r -> Map.entry(r.get(0, String.class) + "|" + r.get(1, String.class),
                new ItemState(r.get(2, String.class), at(r.get(3, OffsetDateTime.class)))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** Item keys are "{batchId}|{conceptId}"; batch ids never hold '|'. Aligned by index with {@link #concepts}. */
    private static String[] batches(Collection<String> itemKeys) {
        return itemKeys.stream().distinct().map(k -> k.substring(0, k.indexOf('|'))).toArray(String[]::new);
    }

    private static String[] concepts(Collection<String> itemKeys) {
        return itemKeys.stream().distinct().map(k -> k.substring(k.indexOf('|') + 1)).toArray(String[]::new);
    }

    @Override public Mono<Map<String, List<ReviewDecision>>> decisions(Collection<String> itemKeys) {
        if (itemKeys.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT batch_id, concept_id, id, decision, reviewer_role, decided_at FROM ops.review_decision
                WHERE (batch_id, concept_id) IN (SELECT * FROM unnest(:b::text[], :c::text[])) ORDER BY decided_at, id""")
            .bind("b", batches(itemKeys)).bind("c", concepts(itemKeys))
            .map(r -> Map.entry(r.get("batch_id", String.class) + "|" + r.get("concept_id", String.class),
                new ReviewDecision(r.get("id", Long.class), r.get("decision", String.class), null, null,
                    r.get("reviewer_role", String.class), r.get("decided_at", OffsetDateTime.class).toInstant())))
            .all()
            .collect(HashMap<String, List<ReviewDecision>>::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()))
            .map(m -> (Map<String, List<ReviewDecision>>) m);
    }

    @Override public Mono<SubstanceFacts> substance(String bdsId) {
        Mono<List<SeniorViews.Name>> names = db.sql("SELECT name, name_type, source FROM curated.substance_name WHERE bds_id = :id " +
                                                    "ORDER BY " + IngredientSummaryReader.NAME_RANK + ", name")
            .bind("id", bdsId)
            .map(r -> new SeniorViews.Name(r.get("name", String.class), r.get("name_type", String.class), r.get("source", String.class)))
            .all().collectList();
        // ICD-11 comes from the DGDA register: the latest OCL fetch of any product carrying the XM code (§5.6.6).
        Mono<List<IngredientSummary.Code>> codes = db.sql(IngredientSummaryReader.codesSql(
                "SELECT max(rc.fetched_at) FROM curated.brand_product_ingredient bpi JOIN raw.ocl_concept rc ON rc.concept_id = bpi.concept_id " +
                "WHERE bpi.xm_code = c.code"))
            .bind("ids", new String[]{bdsId})
            .map(IngredientSummaryReader::code).all().collectList();
        Mono<String> coverage = db.sql("SELECT coverage FROM curated.interaction_coverage WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("coverage", String.class)).one().defaultIfEmpty("not_run");
        return db.sql("SELECT bds_id, preferred_name FROM curated.substance WHERE bds_id = :id").bind("id", bdsId)
            .map(r -> r.get("preferred_name", String.class)).one()
            .flatMap(name -> Mono.zip(names, codes, coverage).flatMap(t -> {
                String[] dd = t.getT2().stream().filter(c -> "DDINTER".equals(c.system())).map(IngredientSummary.Code::code).toArray(String[]::new);
                Mono<Map<String, IngredientSummaryReader.EntryRow>> rows = dd.length == 0 ? Mono.just(Map.of()) : ingredients.entries(dd);
                return rows.map(e -> {
                    List<IngredientSummary.Entry> list = t.getT2().stream().filter(c -> "DDINTER".equals(c.system())).map(c -> {
                        IngredientSummaryReader.EntryRow x = e.get(c.code());
                        IngredientSummary.Counts counts = x == null ? new IngredientSummary.Counts(0, 0, 0, 0, 0)
                            : new IngredientSummary.Counts(x.major(), x.moderate(), x.minor(), x.unknown(), x.total());
                        return new IngredientSummary.Entry(c.code(), x == null ? null : x.name(), c.routeScope(), counts,
                            x == null ? 0 : x.disease(), x == null ? 0 : x.food(),
                            SourceLinks.code("DDINTER", c.code(), x == null ? null : x.fetchedAt()).orElse(null));
                    }).toList();
                    return new SubstanceFacts(bdsId, name, t.getT1(), t.getT2(), t.getT3(), list);
                });
            }));
    }

    @Override public Mono<Map<String, String>> strengths(Collection<String> bdcIds, String bdsId) {
        if (bdcIds.isEmpty()) return Mono.just(Map.of());
        return db.sql("""
                SELECT bdc_id, strength_value, strength_unit, per_value, per_unit FROM curated.clinical_drug_ingredient
                WHERE bdc_id = ANY(:bdc) AND bds_id = :bds""")
            .bind("bdc", arr(bdcIds)).bind("bds", bdsId)
            .map(r -> Map.entry(r.get("bdc_id", String.class), strengthText(r.get("strength_value", BigDecimal.class),
                r.get("strength_unit", String.class), r.get("per_value", BigDecimal.class), r.get("per_unit", String.class))))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
    }

    /** "{value} {unit}[ per {perValue} {perUnit}]", numbers without trailing zeros (web/lib/relations.ts strengthText). */
    static String strengthText(BigDecimal value, String unit, BigDecimal per, String perUnit) {
        if (value == null) return "";
        String base = (ClinicalDrugReader.plain(value).toPlainString() + " " + (unit == null ? "" : unit)).trim();
        return per == null ? base : (base + " per " + ClinicalDrugReader.plain(per).toPlainString() + " " + (perUnit == null ? "" : perUnit)).trim();
    }

    // ---- pair decisions (§7.7)

    static final String TARGET_TYPE = "ddinter_pair";
    private record Locked(String severity, List<String> actions, String interactionId) {}
    private record AuditHit(String targetId, String outcome) {}

    private static String target(String a, String b) { return a + "/" + b; }

    @Override public Mono<SeniorViews.PairOutcome> decide(String a, String b, NewPairDecision d) {
        Mono<Optional<Locked>> lock = a.compareTo(b) >= 0 ? Mono.just(Optional.empty()) : db.sql("""
                SELECT severity, actions, interaction_id FROM curated.ddinter_pair WHERE ddinter_a = :a AND ddinter_b = :b FOR UPDATE""")
            .bind("a", a).bind("b", b)
            .map(r -> Optional.of(new Locked(r.get("severity", String.class), R2dbcSubstanceAdapter.list(r, "actions"),
                r.get("interaction_id", String.class))))
            .one().defaultIfEmpty(Optional.empty());
        return tx.transactional(lock.flatMap(locked -> replay(a, b, d).switchIfEmpty(Mono.defer(() -> locked.isEmpty()
                ? Mono.error(notFound())
                : held(a, b).flatMap(h -> h ? fresh(a, b, d, locked.get()) : Mono.<SeniorViews.PairOutcome>error(notFound()))))))
            .onErrorResume(DuplicateKeyException.class, e -> tx.transactional(replay(a, b, d).switchIfEmpty(Mono.error(e))));
    }

    private static NotFoundException notFound() {
        return new NotFoundException("pair", "No stored DDInter pair with these entries between substances we hold");
    }

    /** Step 1: empty when the requestId is new. */
    private Mono<SeniorViews.PairOutcome> replay(String a, String b, NewPairDecision d) {
        return db.sql("SELECT target_id, outcome FROM ops.audit_event WHERE event = 'pair_decision' AND request_id = :r")
            .bind("r", d.requestId())
            .map(r -> new AuditHit(r.get("target_id", String.class), r.get("outcome", String.class))).one()
            .flatMap(hit -> target(a, b).equals(hit.targetId()) && d.decision().equals(hit.outcome())
                ? current(a, b, d.reviewerEmail(), true)
                : Mono.error(new InvalidQueryException("requestId",
                    "requestId was already used for another pair decision; send a new requestId for a new decision")));
    }

    /** Step 2's "held": both entries map to a substance of a held product. */
    private Mono<Boolean> held(String a, String b) {
        return db.sql("WITH " + LATEST + """
                , held AS (SELECT DISTINCT xm.bds_id FROM latest l
                           JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = l.concept_id
                           JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
                           WHERE l.note IS DISTINCT FROM '%s')
                SELECT EXISTS (SELECT 1 FROM curated.substance_code c JOIN held h ON h.bds_id = c.bds_id WHERE c.system = 'DDINTER' AND c.code = :a)
                   AND EXISTS (SELECT 1 FROM curated.substance_code c JOIN held h ON h.bds_id = c.bds_id WHERE c.system = 'DDINTER' AND c.code = :b)
                   AS held""".formatted(ReviewSql.REMOVED_NOTE))
            .bind("a", a).bind("b", b).map(r -> Boolean.TRUE.equals(r.get("held", Boolean.class))).one();
    }

    private Mono<PairContent.Content> content(Locked l) {
        if (l.interactionId() == null) return Mono.just(new PairContent.Content(l.severity(), l.actions(), null, null));
        return db.sql("SELECT interaction, management FROM curated.ddinter_interaction_text WHERE interaction_id = :i")
            .bind("i", l.interactionId())
            .map(r -> new PairContent.Content(l.severity(), l.actions(), r.get("interaction", String.class), r.get("management", String.class)))
            .one().defaultIfEmpty(new PairContent.Content(l.severity(), l.actions(), null, null));
    }

    private Mono<List<PairReviewRule.Decision>> decisionsOf(String a, String b, String viewer) {
        return pairReviews.forCodes(List.of(a, b), viewer).map(m -> m.getOrDefault(a + "|" + b, List.of()));
    }

    /** Steps 3–5, then the writes. */
    private Mono<SeniorViews.PairOutcome> fresh(String a, String b, NewPairDecision d, Locked locked) {
        return content(locked).flatMap(content -> decisionsOf(a, b, d.reviewerEmail()).flatMap(ds -> {
            String hash = PairContent.hash(a, b, content);
            if (!hash.equals(d.expectedContentHash()))
                return Mono.error(new ConflictException("contentHash",
                    "This pair changed in DDInter after the page was loaded; reload it and review again"));
            if (!java.util.Objects.equals(PairReviewRule.lastId(ds), d.expectedLastPairReviewId()))
                return Mono.error(new ConflictException("lastPairReviewId",
                    "Another senior pharmacist decided on this pair after the page was loaded; reload it"));
            if ("reviewed".equals(d.decision()) && PairReviewRule.REVIEWED.equals(PairReviewRule.review(ds, hash).state()))
                return Mono.error(new ConflictException("state", "This pair is already reviewed"));
            Map<String, Object> stored = new LinkedHashMap<>();
            stored.put("severity", content.severity());
            stored.put("actions", content.actions());
            stored.put("interaction", content.interaction());
            stored.put("management", content.management());
            String json;
            try {
                json = this.json.writeValueAsString(stored);
            } catch (Exception e) {
                return Mono.error(new IllegalStateException("pair content is not serialisable", e));
            }
            return db.sql("""
                    INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role)
                    VALUES (:a, :b, :decision, :note, :hash, CAST(:content AS jsonb), :email, 'senior')""")
                .bind("a", a).bind("b", b).bind("decision", d.decision()).bind("note", d.note()).bind("hash", hash)
                .bind("content", json).bind("email", d.reviewerEmail())
                .fetch().rowsUpdated()
                .then(db.sql("""
                        INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                        VALUES ('pair_decision', :email, 'senior', :type, :target, :outcome, :rid)""")
                    .bind("email", d.reviewerEmail()).bind("type", TARGET_TYPE).bind("target", target(a, b))
                    .bind("outcome", d.decision()).bind("rid", d.requestId()).fetch().rowsUpdated())
                .then(current(a, b, d.reviewerEmail(), false));
        }));
    }

    private Mono<SeniorViews.PairOutcome> current(String a, String b, String viewer, boolean replayed) {
        Locked none = new Locked(null, List.of(), null);
        return db.sql("SELECT severity, actions, interaction_id FROM curated.ddinter_pair WHERE ddinter_a = :a AND ddinter_b = :b")
            .bind("a", a).bind("b", b)
            .map(r -> new Locked(r.get("severity", String.class), R2dbcSubstanceAdapter.list(r, "actions"), r.get("interaction_id", String.class)))
            .one().defaultIfEmpty(none)
            .flatMap(this::content)
            .flatMap(content -> decisionsOf(a, b, viewer).map(ds -> {
                String hash = PairContent.hash(a, b, content);
                return new SeniorViews.PairOutcome(a, b, PairReviewRule.review(ds, hash),
                    new SeniorViews.PairVersion(hash, PairReviewRule.lastId(ds)), replayed);
            }));
    }

    @Override public Mono<Void> recordRejection(PairRejection r) {
        DatabaseClient.GenericExecuteSpec spec = db.sql("""
                INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id)
                VALUES ('pair_decision_rejected', :email, :role, :type, :target, :outcome, :rid)""")
            .bind("outcome", r.outcome());
        spec = r.actorEmail() == null ? spec.bindNull("email", String.class) : spec.bind("email", r.actorEmail());
        spec = r.actorRole() == null ? spec.bindNull("role", String.class) : spec.bind("role", r.actorRole());
        spec = r.ddinterA() == null ? spec.bindNull("type", String.class).bindNull("target", String.class)
            : spec.bind("type", TARGET_TYPE).bind("target", target(r.ddinterA(), r.ddinterB()));
        spec = r.requestId() == null ? spec.bindNull("rid", UUID.class) : spec.bind("rid", r.requestId());
        return tx.transactional(spec.fetch().rowsUpdated()).then();
    }
}
