package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.NameIndexPort;
import com.niramoy.bddrug.application.port.SearchPort;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.SearchResult;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.*;

/**
 * Search SQL (§7.4). Public status only through ReviewSql.LATEST_PUBLIC. Every LIKE escapes %, _ and \ (likePattern), so
 * a query is a literal, case-insensitive substring (DAR: a prefix). Stubs match trade name and DAR only (D16).
 * Also the spelling index's names (§7.4 "Suggestion"): public trade names and public substances' names, never a stub's.
 */
@Component
public class R2dbcSearchAdapter implements SearchPort, NameIndexPort {
    /** Java " ESCAPE '\\'" is the SQL text ESCAPE '\', as in R2dbcProductAdapter (standard_conforming_strings on). */
    static final String ESC = " ESCAPE '\\'";
    /** Public substances with their public product count (§7.4: "a substance is public only when at least one public product carries it"). */
    static final String PUBSUB = """
        pubsub AS (SELECT x.bds_id, count(DISTINCT bp.concept_id) AS n FROM curated.brand_product bp
                   JOIN latest l ON l.concept_id = bp.concept_id AND l.pub
                   JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                   JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                   GROUP BY x.bds_id)""";
    static final String SUBSTANCE_MATCH = "(lower(s.preferred_name) LIKE :p" + ESC +
        " OR EXISTS (SELECT 1 FROM curated.substance_name sn WHERE sn.bds_id = s.bds_id AND lower(sn.name) LIKE :p" + ESC + "))";
    static final String SHITS = "shits AS (SELECT s.bds_id, s.preferred_name, ps.n FROM curated.substance s " +
        "JOIN pubsub ps ON ps.bds_id = s.bds_id WHERE " + SUBSTANCE_MATCH + ")";
    static final String PRODUCT_MATCH = "(lower(bp.trade_name) LIKE :p" + ESC + " OR lower(bp.dar_number) LIKE :prefix" + ESC +
        " OR lower(bp.generic_content_raw) LIKE :p" + ESC +
        " OR EXISTS (SELECT 1 FROM curated.brand_product_ingredient bpi" +
        " JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code" +
        " JOIN curated.substance s ON s.bds_id = x.bds_id WHERE bpi.concept_id = bp.concept_id AND " + SUBSTANCE_MATCH + "))";
    static final String PHITS = "phits AS (SELECT bp.* FROM curated.brand_product bp JOIN latest l ON l.concept_id = bp.concept_id AND l.pub " +
        "WHERE " + PRODUCT_MATCH + ")";
    static final String STUBS = "stubs AS (SELECT bp.concept_id, bp.trade_name FROM curated.brand_product bp " +
        "LEFT JOIN latest l ON l.concept_id = bp.concept_id WHERE NOT coalesce(l.pub, false) " +
        "AND (lower(bp.trade_name) LIKE :p" + ESC + " OR lower(bp.dar_number) LIKE :prefix" + ESC + "))";
    static final String NAME_RANK = "coalesce(array_position(ARRAY['dgda_content','rxnorm','ddinter','icd11'], sn.name_type), 5)";
    static final List<String> OTHER_ORDER = List.of("rxnorm", "icd11", "ddinter");

    private final DatabaseClient db;
    public R2dbcSearchAdapter(DatabaseClient db) { this.db = db; }

    /** Publicly visible names: public products' trade names, public substances' preferred names and synonyms (§7.4). */
    private static final String PUBLIC_NAMES = " SELECT bp.trade_name AS name FROM curated.brand_product bp" +
        " JOIN latest l ON l.concept_id = bp.concept_id AND l.pub" +
        " UNION SELECT s.preferred_name FROM curated.substance s JOIN pubsub ps ON ps.bds_id = s.bds_id" +
        " UNION SELECT sn.name FROM curated.substance_name sn JOIN pubsub ps ON ps.bds_id = sn.bds_id";

    @Override public Flux<String> publicNames() {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + PUBLIC_NAMES).map(r -> r.get("name", String.class)).all();
    }

    @Override public Mono<Boolean> stillPublic(String name) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + ", names AS (" + PUBLIC_NAMES + ")" +
                      " SELECT EXISTS (SELECT 1 FROM names WHERE lower(name) = lower(:n)) AS pub")
            .bind("n", name).map(r -> Boolean.TRUE.equals(r.get("pub", Boolean.class))).one();
    }

    static String prefix(String term) {
        return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    @Override public Mono<Counts> counts(String term) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + ", " + SHITS + ", " + PHITS + ", " + STUBS +
                      " SELECT (SELECT count(*) FROM shits) AS s, (SELECT count(*) FROM phits) AS a, (SELECT count(*) FROM stubs) AS h")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("prefix", prefix(term))
            .map(r -> new Counts(r.get("s", Long.class), r.get("a", Long.class), r.get("h", Long.class))).one();
    }

    private record SubRow(String bdsId, String preferredName, long n, String alt) {}

    @Override public Flux<SearchResult.SubstanceHit> substances(String term, int limit, int offset) {
        if (limit == 0) return Flux.empty();
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PUBSUB + ", " + SHITS +
                      " SELECT h.bds_id, h.preferred_name, h.n, (SELECT sn.name || chr(1) || sn.name_type FROM curated.substance_name sn" +
                      " WHERE sn.bds_id = h.bds_id AND lower(sn.name) LIKE :p" + ESC + " ORDER BY " + NAME_RANK + ", sn.name LIMIT 1) AS alt" +
                      " FROM shits h ORDER BY lower(h.preferred_name), h.bds_id LIMIT :limit OFFSET :offset")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("limit", limit).bind("offset", offset)
            .map(r -> new SubRow(r.get("bds_id", String.class), r.get("preferred_name", String.class), r.get("n", Long.class),
                r.get("alt", String.class)))
            .all().collectList()
            .flatMapMany(rows -> rows.isEmpty() ? Flux.empty() : details(rows, term));
    }

    private Flux<SearchResult.SubstanceHit> details(List<SubRow> rows, String term) {
        String[] ids = rows.stream().map(SubRow::bdsId).toArray(String[]::new);
        Mono<Map<String, List<String[]>>> names = db.sql("SELECT bds_id, name, name_type FROM curated.substance_name WHERE bds_id = ANY(:ids)")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class), new String[]{r.get("name", String.class), r.get("name_type", String.class)}))
            .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<Map<String, List<String[]>>> codes = db.sql("SELECT bds_id, system, code FROM curated.substance_code " +
                                                         "WHERE bds_id = ANY(:ids) AND system IN ('ATC','RXCUI','DDINTER') ORDER BY bds_id, system, code")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("bds_id", String.class), new String[]{r.get("system", String.class), r.get("code", String.class)}))
            .all().collect(HashMap::new, (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<Map<String, String>> coverage = db.sql("SELECT bds_id, coverage FROM curated.interaction_coverage WHERE bds_id = ANY(:ids)")
            .bind("ids", ids).map(r -> Map.entry(r.get("bds_id", String.class), r.get("coverage", String.class)))
            .all().collectMap(Map.Entry::getKey, Map.Entry::getValue);
        return Mono.zip(names, codes, coverage).flatMapMany(t -> Flux.fromIterable(rows).map(row -> {
            boolean preferred = row.preferredName().toLowerCase(Locale.ROOT).contains(term);
            String[] alt = row.alt() == null ? null : row.alt().split("\u0001", 2);
            String matchedName = preferred || alt == null ? row.preferredName() : alt[0];
            String matchedType = preferred || alt == null ? "preferred" : alt[1];
            List<String> others = new ArrayList<>();
            for (String type : OTHER_ORDER)
                for (String[] n : t.getT1().getOrDefault(row.bdsId(), List.of()))
                    if (type.equals(n[1]) && n[0].equalsIgnoreCase(row.preferredName()) && !others.contains(type)) others.add(type);
            List<String> atc = new ArrayList<>(), rxcui = new ArrayList<>(), dd = new ArrayList<>();
            for (String[] c : t.getT2().getOrDefault(row.bdsId(), List.of()))
                (switch (c[0]) { case "ATC" -> atc; case "RXCUI" -> rxcui; default -> dd; }).add(c[1]);
            dd.sort(DdinterCode.ID_ORDER);
            return new SearchResult.SubstanceHit(row.bdsId(), row.preferredName(), matchedName, matchedType, List.copyOf(others),
                t.getT3().getOrDefault(row.bdsId(), "not_run"), List.copyOf(dd), new SearchResult.KeyCodes(List.copyOf(atc), List.copyOf(rxcui)),
                row.n());
        }));
    }

    @Override public Flux<SearchResult.ProductHit> approved(String term, int limit, int offset) {
        if (limit == 0) return Flux.empty();
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + PHITS +
                      " SELECT bp.concept_id, bp.trade_name, bp.dar_number, bp.company, bp.dosage_form, bp.generic_content_raw, bp.bdc_id," +
                      " cd.display_name, CASE WHEN lower(bp.trade_name) LIKE :p" + ESC + " THEN 'trade_name'" +
                      " WHEN lower(bp.dar_number) LIKE :prefix" + ESC + " THEN 'dar'" +
                      " WHEN lower(bp.generic_content_raw) LIKE :p" + ESC + " THEN 'generic' ELSE 'substance' END AS matched_on," +
                      " (SELECT s.preferred_name FROM curated.brand_product_ingredient bpi" +
                      "  JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code" +
                      "  JOIN curated.substance s ON s.bds_id = x.bds_id WHERE bpi.concept_id = bp.concept_id AND " + SUBSTANCE_MATCH +
                      "  ORDER BY s.preferred_name LIMIT 1) AS via" +
                      " FROM phits bp LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id" +
                      " ORDER BY lower(bp.trade_name), bp.concept_id LIMIT :limit OFFSET :offset")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("prefix", prefix(term)).bind("limit", limit).bind("offset", offset)
            .map(r -> {
                String on = r.get("matched_on", String.class);
                String name = switch (on) {
                    case "trade_name" -> r.get("trade_name", String.class);
                    case "dar" -> r.get("dar_number", String.class);
                    case "generic" -> r.get("generic_content_raw", String.class);
                    default -> r.get("via", String.class);
                };
                String bdc = r.get("bdc_id", String.class);
                return new SearchResult.ProductHit(r.get("concept_id", String.class), r.get("trade_name", String.class),
                    r.get("dar_number", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
                    r.get("generic_content_raw", String.class),
                    bdc == null ? null : new SearchResult.ClinicalRef(bdc, r.get("display_name", String.class)), on, name, "approved");
            })
            .all();
    }

    @Override public Flux<SearchResult.StubHit> stubs(String term, int limit, int offset) {
        if (limit == 0) return Flux.empty();
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + ", " + STUBS +
                      " SELECT concept_id, trade_name FROM stubs ORDER BY lower(trade_name), concept_id LIMIT :limit OFFSET :offset")
            .bind("p", R2dbcProductAdapter.likePattern(term)).bind("prefix", prefix(term)).bind("limit", limit).bind("offset", offset)
            .map(r -> new SearchResult.StubHit(r.get("concept_id", String.class), r.get("trade_name", String.class), "not_reviewed"))
            .all();
    }
}
