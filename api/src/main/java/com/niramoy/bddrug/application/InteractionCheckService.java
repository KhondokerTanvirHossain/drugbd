package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.application.port.CheckQueryPort.CheckData;
import com.niramoy.bddrug.application.port.CheckQueryPort.IngredientRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.PairRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.ProductRow;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.CheckResult.*;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.RouteRule;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.Severity;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.*;

/**
 * The interaction checker (§6.7.2, §7.4). Under public scope a product no pharmacist has approved is listed in
 * notReviewed (id and trade name) and takes no other part. Every substance pair of two different approved products is
 * either checked (an alert per stored row, or "no interaction listed") or not checked with a reason; same-product and
 * same-BDS pairs are listed and never counted. Nothing is silently dropped, so "no data" is never shown as "no
 * interactions".
 */
@Service
public class InteractionCheckService {
    public static final int MIN_IDS = 2, MAX_IDS = 20;
    public static final String SOURCE = "DDInter 2.0";
    static final String FIELD = "conceptIds";

    private final CheckQueryPort port;
    public InteractionCheckService(CheckQueryPort port) { this.port = port; }

    public Mono<CheckResult> check(List<String> conceptIds, Scope scope) {
        if (!valid(conceptIds))
            return Mono.error(new InvalidQueryException(FIELD, "conceptIds must hold 2-20 unique product IDs"));
        List<String> ids = List.copyOf(conceptIds);
        return port.load(ids).map(data -> compute(ids, data, scope));
    }

    static boolean valid(List<String> ids) {
        if (ids == null || ids.size() < MIN_IDS || ids.size() > MAX_IDS) return false;
        Set<String> seen = new HashSet<>();
        for (String id : ids)
            if (id == null || id.isBlank() || !seen.add(id)) return false;
        return true;
    }

    /** One product substance: its chosen entries, or the §6.7.2 rule 1 reason it cannot be checked. listed = a real ingredient row. */
    record Sub(String bdsId, String name, String coverage, RouteRule.Choice choice, String reason, boolean listed) {}
    record Prod(ProductRow row, List<Sub> subs) {}

    static CheckResult compute(List<String> ids, CheckData data, Scope scope) {
        Map<String, ProductRow> products = new HashMap<>();
        for (ProductRow p : data.products()) products.put(p.conceptId(), p);
        for (String id : ids)
            if (!products.containsKey(id)) throw new NotFoundException(FIELD, "Product not found: " + id);
        Map<String, List<IngredientRow>> ingredients = new HashMap<>();
        for (IngredientRow i : data.ingredients()) ingredients.computeIfAbsent(i.conceptId(), k -> new ArrayList<>()).add(i);
        Map<String, PairRow> pairs = new HashMap<>();
        for (PairRow p : data.pairs()) pairs.put(pairKey(p.ddinterA(), p.ddinterB()), p);

        List<CheckedProduct> checkedProducts = new ArrayList<>();
        List<NoData> noData = new ArrayList<>();
        List<NotReviewed> notReviewed = new ArrayList<>();
        List<Prod> prods = new ArrayList<>();
        for (String id : ids) {
            ProductRow p = products.get(id);
            if (scope == Scope.PUBLIC && !"ok".equals(p.reviewStatus())) {
                notReviewed.add(new NotReviewed(id, p.tradeName()));
                continue;
            }
            List<Sub> subs = substances(p, ingredients.getOrDefault(id, List.of()), data);
            prods.add(new Prod(p, subs));
            checkedProducts.add(new CheckedProduct(id, p.tradeName(), p.route(), subs.stream().filter(Sub::listed)
                .map(s -> new SubstanceCoverage(s.bdsId(), s.name(), s.coverage(), chosen(s, data))).toList()));
            for (Sub s : subs) if (s.reason() != null) noData.add(new NoData(id, s.bdsId(), s.name()));
        }

        List<NotChecked> notChecked = new ArrayList<>();
        for (Prod prod : prods)
            for (int i = 0; i < prod.subs().size(); i++)
                for (int j = i + 1; j < prod.subs().size(); j++) {
                    Sub a = prod.subs().get(i), b = prod.subs().get(j);
                    if (!same(a, b)) notChecked.add(new NotChecked(side(prod, a), side(prod, b), "same_product", "a"));
                }

        List<Alert> alerts = new ArrayList<>();
        List<NoInteraction> none = new ArrayList<>();
        Map<String, String> dupNames = new LinkedHashMap<>();
        Map<String, List<String>> dupConcepts = new LinkedHashMap<>();
        for (Prod prod : prods)
            for (Sub s : prod.subs())
                if (s.bdsId() != null) {
                    dupNames.putIfAbsent(s.bdsId(), s.name());
                    List<String> c = dupConcepts.computeIfAbsent(s.bdsId(), k -> new ArrayList<>());
                    if (!c.contains(prod.row().conceptId())) c.add(prod.row().conceptId());
                }
        int total = 0, checked = 0, alerted = 0;
        for (int i = 0; i < prods.size(); i++)
            for (int j = i + 1; j < prods.size(); j++) {
                Prod pa = prods.get(i), pb = prods.get(j);
                for (Sub a : pa.subs())
                    for (Sub b : pb.subs()) {
                        if (same(a, b)) continue;                       // rule 4: a duplicate, never a pair
                        total++;
                        if (a.reason() != null || b.reason() != null) {
                            boolean onA = b.reason() == null || (a.reason() != null
                                && BatchPairs.REASON_ORDER.indexOf(a.reason()) <= BatchPairs.REASON_ORDER.indexOf(b.reason()));
                            notChecked.add(new NotChecked(side(pa, a), side(pb, b), onA ? a.reason() : b.reason(), onA ? "a" : "b"));
                            continue;
                        }
                        checked++;
                        int before = alerts.size();
                        alertsFor(pa, a, pb, b, pairs, data.reviews(), alerts);
                        if (alerts.size() > before) alerted++;
                        else none.add(new NoInteraction(side(pa, a), side(pb, b), a.choice().codes().get(0).code(),
                            b.choice().codes().get(0).code()));
                    }
            }
        alerts.sort(Comparator.comparingInt((Alert x) -> Severity.rank(x.severity()))
            .thenComparing(x -> (x.a().tradeName() + " + " + x.b().tradeName()).toLowerCase(Locale.ROOT)));

        List<Duplicate> duplicates = new ArrayList<>();
        dupConcepts.forEach((bds, concepts) -> {
            if (concepts.size() > 1) duplicates.add(new Duplicate(bds, dupNames.get(bds), List.copyOf(concepts)));
        });
        int[] sev = new int[4];
        for (Alert a : alerts) sev[Severity.rank(a.severity())]++;
        Summary summary = new Summary(ids.size(), total, checked, alerted, checked - alerted, total - checked, notReviewed.size(),
            new BySeverity(sev[0], sev[1], sev[2], sev[3]));
        return new CheckResult(summary, checkedProducts, alerts, none, notChecked, duplicates, noData, notReviewed);
    }

    /**
     * One entry per substance (rows without a substance stay apart, by XM code). A product with no ingredient row at all
     * is one unmapped pseudo-substance named by its generic content, so its pairs are listed as not checked (G3).
     */
    private static List<Sub> substances(ProductRow p, List<IngredientRow> rows, CheckData data) {
        if (rows.isEmpty()) return List.of(new Sub(null, p.genericContentRaw(), "not_run", null, "unmapped", false));
        Map<String, Sub> byKey = new LinkedHashMap<>();
        for (IngredientRow r : rows) {
            if (r.bdsId() == null) {
                byKey.putIfAbsent("xm:" + r.xmCode(), new Sub(null, r.ingredientName(), "not_run", null, "unmapped", true));
                continue;
            }
            String coverage = r.coverage() != null ? r.coverage() : "not_run";      // §7.3: no coverage row = never ran
            RouteRule.Choice choice = "full".equals(coverage)
                ? RouteRule.choose(data.codesByBds().getOrDefault(r.bdsId(), List.of()), p.route()).orElse(null) : null;
            byKey.putIfAbsent("bds:" + r.bdsId(), new Sub(r.bdsId(), r.preferredName() != null ? r.preferredName() : r.ingredientName(),
                coverage, choice, reason(coverage, choice, data.listedCodes()), true));
        }
        List<Sub> out = new ArrayList<>(byKey.values());
        out.sort(Comparator.comparing((Sub s) -> s.name().toLowerCase(Locale.ROOT))
            .thenComparing(Sub::bdsId, Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }

    /** §6.7.2 rule 1. A chosen entry without a stored full pair list was never read in full: not_run (D41). */
    static String reason(String coverage, RouteRule.Choice choice, Set<String> listed) {
        if ("none".equals(coverage)) return "no_data";
        if (!"full".equals(coverage)) return "not_run";
        if (choice == null) return "no_route";
        return choice.codes().stream().allMatch(c -> listed.contains(c.code())) ? null : "not_run";
    }

    private static List<Chosen> chosen(Sub s, CheckData data) {
        if (s.reason() != null || s.choice() == null) return List.of();
        return s.choice().codes().stream().map(c -> new Chosen(c.code(), data.entryNames().get(c.code()), c.routeScope(),
            s.choice().routeAssumed())).toList();
    }

    private static boolean same(Sub a, Sub b) { return a.bdsId() != null && a.bdsId().equals(b.bdsId()); }

    private static Side side(Prod p, Sub s) {
        String scope = s.reason() == null && s.choice() != null ? s.choice().codes().get(0).routeScope() : null;
        return new Side(p.row().conceptId(), p.row().tradeName(), s.bdsId(), s.name(), scope);
    }

    private static void alertsFor(Prod pa, Sub a, Prod pb, Sub b, Map<String, PairRow> pairs,
                                  Map<String, List<PairReviewRule.Decision>> reviews, List<Alert> out) {
        boolean assumed = a.choice().routeAssumed() || b.choice().routeAssumed();
        Set<String> seen = new HashSet<>();
        for (DdinterCode ca : a.choice().codes())
            for (DdinterCode cb : b.choice().codes()) {
                if (ca.code().equals(cb.code())) continue;
                String key = pairKey(ca.code(), cb.code());
                PairRow pair = pairs.get(key);
                if (pair == null || !seen.add(key)) continue;
                // P1C's rule, as its alertsFor computed it: the coarse public form against the pair's current content hash
                String hash = PairContent.hash(pair.ddinterA(), pair.ddinterB(),
                    new PairContent.Content(pair.severity(), pair.actions(), pair.interaction(), pair.management()));
                out.add(new Alert(pair.severity(),
                    new Side(pa.row().conceptId(), pa.row().tradeName(), a.bdsId(), a.name(), ca.routeScope()),
                    new Side(pb.row().conceptId(), pb.row().tradeName(), b.bdsId(), b.name(), cb.routeScope()),
                    pair.actions(), pair.interaction(), pair.management(), assumed, pair.ddinterA(), pair.ddinterB(),
                    pair.interactionId(), SOURCE,
                    PairReviewRule.publicReview(reviews.getOrDefault(pair.ddinterA() + "|" + pair.ddinterB(), List.of()), hash)));
            }
    }

    /** ddinter_pair stores a < b in text order. */
    private static String pairKey(String x, String y) {
        return x.compareTo(y) < 0 ? x + "\u0000" + y : y + "\u0000" + x;
    }
}
