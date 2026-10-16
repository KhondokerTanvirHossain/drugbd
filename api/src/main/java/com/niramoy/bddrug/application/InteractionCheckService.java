package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.CheckQueryPort;
import com.niramoy.bddrug.application.port.CheckQueryPort.CheckData;
import com.niramoy.bddrug.application.port.CheckQueryPort.IngredientRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.PairRow;
import com.niramoy.bddrug.application.port.CheckQueryPort.ProductRow;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.CheckResult.CheckedProduct;
import com.niramoy.bddrug.domain.CheckResult.Duplicate;
import com.niramoy.bddrug.domain.CheckResult.NoData;
import com.niramoy.bddrug.domain.CheckResult.NotReviewed;
import com.niramoy.bddrug.domain.CheckResult.SubstanceCoverage;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.InteractionAlert;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.RouteRule;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.Severity;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.*;

/**
 * The interaction checker. Every product substance ends up either usable for alerts or listed in
 * {@code noData}; nothing is silently dropped, so "no data" is never shown as "no interactions".
 * Under public scope a product no pharmacist has approved is listed in {@code notReviewed} (ID only)
 * and takes no part in the products, alerts, duplicates or noData lists.
 */
@Service
public class InteractionCheckService {
    public static final int MIN_IDS = 2, MAX_IDS = 20;
    public static final String SOURCE = "DDInter 2.0";
    static final String FIELD = "conceptIds";
    private static final Comparator<SubstanceCoverage> BY_NAME = Comparator
        .comparing((SubstanceCoverage s) -> s.name().toLowerCase(Locale.ROOT))
        .thenComparing(SubstanceCoverage::bdsId, Comparator.nullsLast(Comparator.naturalOrder()));

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

    private record Usable(String conceptId, String bdsId, String name, RouteRule.Choice choice) {}

    static CheckResult compute(List<String> ids, CheckData data, Scope scope) {
        Map<String, ProductRow> products = new HashMap<>();
        for (ProductRow p : data.products()) products.put(p.conceptId(), p);
        for (String id : ids)
            if (!products.containsKey(id)) throw new NotFoundException(FIELD, "Product not found: " + id);

        Map<String, List<IngredientRow>> ingredients = new HashMap<>();
        for (IngredientRow i : data.ingredients()) ingredients.computeIfAbsent(i.conceptId(), k -> new ArrayList<>()).add(i);
        Map<String, PairRow> pairs = new HashMap<>();
        for (PairRow p : data.pairs()) pairs.put(pairKey(p.ddinterA(), p.ddinterB()), p);

        List<CheckedProduct> checked = new ArrayList<>();
        List<NoData> noData = new ArrayList<>();
        List<NotReviewed> notReviewed = new ArrayList<>();
        List<List<Usable>> usable = new ArrayList<>();
        Map<String, String> dupNames = new LinkedHashMap<>();
        Map<String, List<String>> dupConcepts = new LinkedHashMap<>();

        for (String id : ids) {
            ProductRow p = products.get(id);
            if (scope == Scope.PUBLIC && !"ok".equals(p.reviewStatus())) {
                notReviewed.add(new NotReviewed(id));
                continue;
            }
            List<SubstanceCoverage> subs = substances(ingredients.getOrDefault(id, List.of()));
            checked.add(new CheckedProduct(id, p.tradeName(), subs));
            List<Usable> mine = new ArrayList<>();
            usable.add(mine);
            if (subs.isEmpty()) {
                noData.add(new NoData(id, null, p.genericContentRaw()));   // no ingredient mapping at all
                continue;
            }
            for (SubstanceCoverage s : subs) {
                if (s.bdsId() == null) { noData.add(new NoData(id, null, s.name())); continue; }
                dupNames.putIfAbsent(s.bdsId(), s.name());
                dupConcepts.computeIfAbsent(s.bdsId(), k -> new ArrayList<>()).add(id);
                // RouteRule picks from every entry (no systemic fallback past an exact one, §8.2); a chosen entry without
                // a stored full pair list makes the substance noData, never "no interactions" (§7.4, D41)
                Optional<RouteRule.Choice> choice = "full".equals(s.coverage())
                    ? RouteRule.choose(data.codesByBds().getOrDefault(s.bdsId(), List.of()), p.route())
                        .filter(c -> c.codes().stream().allMatch(code -> data.listedCodes().contains(code.code())))
                    : Optional.empty();
                if (choice.isEmpty()) noData.add(new NoData(id, s.bdsId(), s.name()));
                else mine.add(new Usable(id, s.bdsId(), s.name(), choice.get()));
            }
        }

        List<InteractionAlert> alerts = new ArrayList<>();
        for (int i = 0; i < usable.size(); i++)
            for (int j = i + 1; j < usable.size(); j++)
                for (Usable a : usable.get(i))
                    for (Usable b : usable.get(j))
                        if (!a.bdsId().equals(b.bdsId())) alertsFor(a, b, pairs, data.reviews(), alerts);
        alerts.sort(Comparator.comparingInt(a -> Severity.rank(a.severity())));   // stable: keeps product order

        List<Duplicate> duplicates = new ArrayList<>();
        dupConcepts.forEach((bds, concepts) -> {
            if (concepts.size() > 1) duplicates.add(new Duplicate(bds, dupNames.get(bds), List.copyOf(concepts)));
        });
        return new CheckResult(checked, alerts, duplicates, noData, notReviewed);
    }

    /**
     * One entry per substance: rows without a substance stay separate (by XM code). A substance with no coverage row is
     * not_run (§7.3): DDInter was never asked about it. It stays in noData until P2's notChecked list (§7.4) replaces it.
     */
    private static List<SubstanceCoverage> substances(List<IngredientRow> rows) {
        Map<String, SubstanceCoverage> byKey = new LinkedHashMap<>();
        for (IngredientRow r : rows) {
            if (r.bdsId() == null)
                byKey.putIfAbsent("xm:" + r.xmCode(), new SubstanceCoverage(null, r.ingredientName(), "none"));
            else
                byKey.putIfAbsent("bds:" + r.bdsId(), new SubstanceCoverage(r.bdsId(),
                    r.preferredName() != null ? r.preferredName() : r.ingredientName(),
                    r.coverage() != null ? r.coverage() : "not_run"));
        }
        List<SubstanceCoverage> out = new ArrayList<>(byKey.values());
        out.sort(BY_NAME);
        return out;
    }

    private static void alertsFor(Usable a, Usable b, Map<String, PairRow> pairs, Map<String, List<PairReviewRule.Decision>> reviews,
                                  List<InteractionAlert> out) {
        boolean assumed = a.choice().routeAssumed() || b.choice().routeAssumed();
        Set<String> seen = new HashSet<>();
        for (DdinterCode ca : a.choice().codes())
            for (DdinterCode cb : b.choice().codes()) {
                if (ca.code().equals(cb.code())) continue;
                String key = pairKey(ca.code(), cb.code());
                PairRow pair = pairs.get(key);
                if (pair == null || !seen.add(key)) continue;
                String hash = PairContent.hash(pair.ddinterA(), pair.ddinterB(),
                    new PairContent.Content(pair.severity(), pair.actions(), pair.interaction(), pair.management()));
                out.add(new InteractionAlert(pair.severity(),
                    new InteractionAlert.Side(a.conceptId(), a.bdsId(), a.name()),
                    new InteractionAlert.Side(b.conceptId(), b.bdsId(), b.name()),
                    pair.actions(), pair.interaction(), pair.management(), assumed, SOURCE, pair.ddinterA(), pair.ddinterB(),
                    PairReviewRule.publicReview(reviews.getOrDefault(pair.ddinterA() + "|" + pair.ddinterB(), List.of()), hash)));
            }
    }

    /** ddinter_pair stores a < b in text order. */
    private static String pairKey(String x, String y) {
        return x.compareTo(y) < 0 ? x + "\u0000" + y : y + "\u0000" + x;
    }
}
