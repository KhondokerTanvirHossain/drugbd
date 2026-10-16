package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ProductInteractionsPort;
import com.niramoy.bddrug.domain.*;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.util.*;
import java.util.stream.Stream;

/**
 * P10 reads, set-based (§7.3 "never one query per batch"): this product's ingredients, and every other public product
 * (through ReviewSql.LATEST_PUBLIC) grouped in SQL by partner substance and route, one row per group with its first
 * BRANDS_MAX brands and its count, so a call never carries the public catalogue into the JVM; then one code query, one
 * pair query restricted to this product's chosen entries, and P1C's one pair-review query (PairReviewReader).
 */
@Component
public class R2dbcProductInteractionsAdapter implements ProductInteractionsPort {
    private record Line(String route, String xmCode, String ingredient, String bdsId, String preferredName, String coverage) {}
    private record Group(String bdsId, String name, String coverage, String route, List<PublicPairs.Brand> brands, int count) {}
    private record Code(String bdsId, DdinterCode code, boolean listed) {}

    /**
     * One row per (partner substance, route) over the public products other than :c: a mapped substance by bds id (the
     * XM code's substance_code row references it), an unmapped ingredient by its name. A product is in a group once (its
     * ingredients mapped to one substance collapse in subs), so n counts products. The brands are the first :max
     * (BRANDS_MAX) in PublicPairs' brand order: lower-case trade name, then concept id, under COLLATE "C", which compares by
     * code point as String.compareTo does for every name in the Basic Multilingual Plane; PublicPairs re-sorts them. The
     * groups come in the order PublicPairs.compute would first meet them (by concept id, then XM code). The rows that are
     * sorted stay narrow, and names and coverage join only the groups, so the sort fits in memory at 40,000 products.
     */
    private static final String GROUPS = "WITH " + ReviewSql.LATEST_PUBLIC + """
            , subs AS (
                SELECT bp.concept_id, bp.trade_name, cd.route COLLATE "C" AS route, x.bds_id COLLATE "C" AS bds_id,
                       CASE WHEN x.bds_id IS NULL THEN bpi.ingredient_name END COLLATE "C" AS unmapped, min(bpi.xm_code) AS xm
                FROM latest l
                JOIN curated.brand_product bp ON bp.concept_id = l.concept_id
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                LEFT JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                WHERE l.pub AND l.concept_id <> :c
                GROUP BY bp.concept_id, 3, 4, 5)
            , g AS (
                SELECT bds_id, unmapped, route, count(*) AS n,
                       (array_agg(concept_id ORDER BY lower(trade_name) COLLATE "C", concept_id COLLATE "C"))[1 : :max] AS ids,
                       (array_agg(trade_name ORDER BY lower(trade_name) COLLATE "C", concept_id COLLATE "C"))[1 : :max] AS names,
                       min(ARRAY[concept_id, xm]) AS first
                FROM subs
                GROUP BY bds_id, unmapped, route)
            SELECT g.bds_id, coalesce(s.preferred_name, g.unmapped) AS name, ic.coverage, g.route, g.n, g.ids, g.names
            FROM g
            LEFT JOIN curated.substance s ON s.bds_id = g.bds_id
            LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = g.bds_id
            ORDER BY g.first""";

    private final DatabaseClient db;
    private final PairReviewReader pairReviews;
    public R2dbcProductInteractionsAdapter(DatabaseClient db, PairReviewReader pairReviews) {
        this.db = db;
        this.pairReviews = pairReviews;
    }

    @Override public Mono<Facts> facts(String conceptId) {
        Mono<List<Line>> mine = db.sql("""
                SELECT cd.route, bpi.xm_code, bpi.ingredient_name, s.bds_id, s.preferred_name, ic.coverage
                FROM curated.brand_product bp
                LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
                LEFT JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = x.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = s.bds_id
                WHERE bp.concept_id = :c
                ORDER BY bpi.xm_code""")
            .bind("c", conceptId)
            .map(r -> new Line(r.get("route", String.class), r.get("xm_code", String.class), r.get("ingredient_name", String.class),
                r.get("bds_id", String.class), r.get("preferred_name", String.class), r.get("coverage", String.class)))
            .all().collectList();
        Mono<List<Group>> groups = db.sql(GROUPS)
            .bind("c", conceptId)
            .bind("max", PublicPairs.BRANDS_MAX)
            .map(r -> {
                String[] ids = r.get("ids", String[].class), names = r.get("names", String[].class);
                List<PublicPairs.Brand> brands = new ArrayList<>(ids.length);
                for (int i = 0; i < ids.length; i++) brands.add(new PublicPairs.Brand(ids[i], names[i]));
                return new Group(r.get("bds_id", String.class), r.get("name", String.class), r.get("coverage", String.class),
                    r.get("route", String.class), brands, r.get("n", Long.class).intValue());
            })
            .all().collectList();
        return Mono.zip(mine, groups).flatMap(t -> {
            String[] bds = Stream.concat(t.getT1().stream().map(Line::bdsId), t.getT2().stream().map(Group::bdsId))
                .filter(Objects::nonNull).distinct().toArray(String[]::new);
            return codes(bds).flatMap(codes -> assemble(t.getT1(), t.getT2(), codes));
        });
    }

    private Mono<List<Code>> codes(String[] bds) {
        if (bds.length == 0) return Mono.just(List.of());
        return db.sql("""
                SELECT c.bds_id, c.code, c.route_scope, d.ddinter_id IS NOT NULL AS listed
                FROM curated.substance_code c LEFT JOIN curated.ddinter_drug d ON d.ddinter_id = c.code
                WHERE c.system = 'DDINTER' AND c.bds_id = ANY(:bds)""")
            .bind("bds", bds)
            .map(r -> new Code(r.get("bds_id", String.class), new DdinterCode(r.get("code", String.class), r.get("route_scope", String.class)),
                Boolean.TRUE.equals(r.get("listed", Boolean.class))))
            .all().collectList();
    }

    private Mono<Facts> assemble(List<Line> lines, List<Group> groups, List<Code> codes) {
        Map<String, List<DdinterCode>> byBds = new HashMap<>();
        Set<String> complete = new HashSet<>();
        for (Code c : codes) {
            byBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(c.code());
            if (c.listed()) complete.add(c.code().code());
        }
        String route = lines.isEmpty() ? null : lines.get(0).route();
        Map<String, BatchPairs.Substance> subs = new LinkedHashMap<>();
        for (Line l : lines)
            subs.putIfAbsent(l.bdsId() != null ? "bds:" + l.bdsId() : "xm:" + l.xmCode(), new BatchPairs.Substance(l.bdsId(),
                l.bdsId() != null && l.preferredName() != null ? l.preferredName() : l.ingredient(), l.coverage(),
                l.bdsId() == null ? List.of() : byBds.getOrDefault(l.bdsId(), List.of())));
        List<BatchPairs.Substance> mine = List.copyOf(subs.values());
        List<PublicPairs.PartnerGroup> partners = groups.stream().map(g -> new PublicPairs.PartnerGroup(new BatchPairs.Substance(g.bdsId(),
            g.name(), g.coverage(), g.bdsId() == null ? List.of() : byBds.getOrDefault(g.bdsId(), List.of())), g.route(), g.brands(),
            g.count())).toList();
        Set<String> chosen = new TreeSet<>();
        for (BatchPairs.Substance s : mine)
            RouteRule.choose(s.codes(), route).ifPresent(c -> c.codes().forEach(x -> chosen.add(x.code())));
        Mono<List<PublicPairs.Row>> rows = chosen.isEmpty() ? Mono.just(List.of()) : db.sql("""
                SELECT p.ddinter_a, p.ddinter_b, p.severity, p.actions, t.interaction, t.management
                FROM curated.ddinter_pair p LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                WHERE p.ddinter_a = ANY(:ids) OR p.ddinter_b = ANY(:ids)""")
            .bind("ids", chosen.toArray(String[]::new))
            .map(r -> new PublicPairs.Row(r.get("ddinter_a", String.class), r.get("ddinter_b", String.class), r.get("severity", String.class),
                R2dbcSubstanceAdapter.list(r, "actions"), r.get("interaction", String.class), r.get("management", String.class)))
            .all().collectList();
        return rows.flatMap(list -> {
            List<PublicPairReviews.Pair> pairs = list.stream().map(r -> new PublicPairReviews.Pair(r.ddinterA(), r.ddinterB(),
                r.severity(), r.actions(), r.interaction(), r.management())).toList();
            return pairReviews.forCodes(PublicPairReviews.codes(pairs), null).map(d -> PublicPairReviews.of(pairs, d))
                .map(rv -> new Facts(route, mine, partners, list, complete, rv));
        });
    }
}
