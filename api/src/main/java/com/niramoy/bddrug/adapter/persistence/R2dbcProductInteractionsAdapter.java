package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ProductInteractionsPort;
import com.niramoy.bddrug.domain.*;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.util.*;

/**
 * P10 reads, set-based (§7.3 "never one query per batch"): one product-and-ingredient query (this product plus every
 * public product, through ReviewSql.LATEST_PUBLIC), one code query, one pair query restricted to this product's chosen
 * entries, and P1C's one pair-review query (PairReviewReader).
 */
@Component
public class R2dbcProductInteractionsAdapter implements ProductInteractionsPort {
    private record Line(String conceptId, String tradeName, String route, String xmCode, String ingredient, String bdsId,
                        String preferredName, String coverage) {}
    private record Code(String bdsId, DdinterCode code, boolean listed) {}

    private final DatabaseClient db;
    private final PairReviewReader pairReviews;
    public R2dbcProductInteractionsAdapter(DatabaseClient db, PairReviewReader pairReviews) {
        this.db = db;
        this.pairReviews = pairReviews;
    }

    @Override public Mono<Facts> facts(String conceptId) {
        return db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " + """
                , prods AS (SELECT bp.concept_id, bp.trade_name, cd.route FROM curated.brand_product bp
                            LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
                            LEFT JOIN latest l ON l.concept_id = bp.concept_id
                            WHERE bp.concept_id = :c OR coalesce(l.pub, false))
                SELECT p.concept_id, p.trade_name, p.route, bpi.xm_code, bpi.ingredient_name, s.bds_id, s.preferred_name, ic.coverage
                FROM prods p
                JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = p.concept_id
                LEFT JOIN curated.substance_code x ON x.system = 'ICD11_XM' AND x.code = bpi.xm_code
                LEFT JOIN curated.substance s ON s.bds_id = x.bds_id
                LEFT JOIN curated.interaction_coverage ic ON ic.bds_id = s.bds_id
                ORDER BY p.concept_id, bpi.xm_code""")
            .bind("c", conceptId)
            .map(r -> new Line(r.get("concept_id", String.class), r.get("trade_name", String.class), r.get("route", String.class),
                r.get("xm_code", String.class), r.get("ingredient_name", String.class), r.get("bds_id", String.class),
                r.get("preferred_name", String.class), r.get("coverage", String.class)))
            .all().collectList()
            .flatMap(lines -> {
                String[] bds = lines.stream().map(Line::bdsId).filter(Objects::nonNull).distinct().toArray(String[]::new);
                return codes(bds).flatMap(codes -> assemble(conceptId, lines, codes));
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

    private Mono<Facts> assemble(String conceptId, List<Line> lines, List<Code> codes) {
        Map<String, List<DdinterCode>> byBds = new HashMap<>();
        Set<String> complete = new HashSet<>();
        for (Code c : codes) {
            byBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(c.code());
            if (c.listed()) complete.add(c.code().code());
        }
        Map<String, PublicPairs.Partner> products = new LinkedHashMap<>();
        Map<String, Map<String, BatchPairs.Substance>> subs = new LinkedHashMap<>();
        for (Line l : lines) {
            products.putIfAbsent(l.conceptId(), new PublicPairs.Partner(l.conceptId(), l.tradeName(), l.route(), List.of()));
            String key = l.bdsId() != null ? "bds:" + l.bdsId() : "xm:" + l.xmCode();
            subs.computeIfAbsent(l.conceptId(), k -> new LinkedHashMap<>()).putIfAbsent(key, new BatchPairs.Substance(l.bdsId(),
                l.bdsId() != null && l.preferredName() != null ? l.preferredName() : l.ingredient(), l.coverage(),
                l.bdsId() == null ? List.of() : byBds.getOrDefault(l.bdsId(), List.of())));
        }
        List<PublicPairs.Partner> partners = new ArrayList<>();
        products.forEach((id, p) -> partners.add(new PublicPairs.Partner(id, p.tradeName(), p.route(),
            List.copyOf(subs.getOrDefault(id, Map.of()).values()))));
        PublicPairs.Partner me = partners.stream().filter(p -> p.conceptId().equals(conceptId)).findFirst()
            .orElse(new PublicPairs.Partner(conceptId, "", null, List.of()));
        Set<String> chosen = new TreeSet<>();
        for (BatchPairs.Substance s : me.substances())
            RouteRule.choose(s.codes(), me.route()).ifPresent(c -> c.codes().forEach(x -> chosen.add(x.code())));
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
                .map(rv -> new Facts(me.route(), me.substances(), partners, list, complete, rv));
        });
    }
}
