package com.niramoy.bddrug.domain;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Spec §5.6.2: the open record's DDInter pairs with the other current records of its batch, with RouteRule applied on
 * both sides per record route (D14), and the pairs it cannot check (§6.7.2 rules 1–4). A pair of usable sides with no
 * stored row is "no interaction listed" and is not returned here; only the batch count needs it.
 */
public final class BatchPairs {
    private BatchPairs() {}

    public record Substance(String bdsId, String name, String coverage, List<DdinterCode> codes) {}
    public record Product(String conceptId, String tradeName, int index, String route, List<Substance> substances) {}
    public record PairRow(String ddinterA, String ddinterB, String nameA, String nameB, String severity, List<String> actions,
                          String interaction, String management) {}
    public record PartnerRef(String conceptId, String tradeName, int index) {}
    public record Pair(String ddinterA, String ddinterB, String nameA, String nameB, String substance, String partnerSubstance,
                       String severity, List<String> actions, String interaction, String management, List<PartnerRef> partners) {}
    public record NotChecked(String substance, String partnerSubstance, List<PartnerRef> partners, String reason, String side,
                             String route) {}
    public record Result(int totalBatchPairs, List<Pair> pairs, List<NotChecked> notChecked) {}

    /** When both sides are unusable, the first reason in this list wins (this side on a tie). */
    public static final List<String> REASON_ORDER = List.of("no_data", "unmapped", "not_run", "no_route");
    private static final List<String> SEVERITY_ORDER = List.of("major", "moderate", "minor");

    private record Use(List<String> chosen, String reason) {}

    static Use use(Substance s, String route, Set<String> complete) {
        if (s.bdsId() == null) return new Use(List.of(), "unmapped");
        if ("none".equals(s.coverage())) return new Use(List.of(), "no_data");
        if (!"full".equals(s.coverage())) return new Use(List.of(), "not_run");
        Optional<RouteRule.Choice> choice = RouteRule.choose(s.codes(), route);
        if (choice.isEmpty()) return new Use(List.of(), "no_route");
        List<String> ids = choice.get().codes().stream().map(DdinterCode::code).toList();
        return complete.containsAll(ids) ? new Use(ids, null) : new Use(List.of(), "not_run");
    }

    private static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }
    private static boolean sameSubstance(Substance s, Substance t) { return s.bdsId() != null && s.bdsId().equals(t.bdsId()); }
    private static int severityRank(String s) { int i = SEVERITY_ORDER.indexOf(s); return i < 0 ? SEVERITY_ORDER.size() : i; }

    public static Result compute(String conceptId, List<Product> products, List<PairRow> rows, Set<String> complete) {
        Map<String, PairRow> byKey = new LinkedHashMap<>();
        for (PairRow r : rows) byKey.put(key(r.ddinterA(), r.ddinterB()), r);

        Set<String> batch = new HashSet<>();
        for (int i = 0; i < products.size(); i++)
            for (int j = i + 1; j < products.size(); j++)
                for (Substance s : products.get(i).substances())
                    for (Substance t : products.get(j).substances()) {
                        if (sameSubstance(s, t)) continue;
                        Use us = use(s, products.get(i).route(), complete), ut = use(t, products.get(j).route(), complete);
                        if (us.reason() != null || ut.reason() != null) continue;
                        for (String a : us.chosen()) for (String b : ut.chosen()) if (byKey.containsKey(key(a, b))) batch.add(key(a, b));
                    }

        Product me = products.stream().filter(p -> p.conceptId().equals(conceptId)).findFirst().orElse(null);
        if (me == null) return new Result(batch.size(), List.of(), List.of());

        Map<String, Pair> pairs = new LinkedHashMap<>();
        Map<String, NotChecked> notChecked = new LinkedHashMap<>();
        for (Product q : products) {
            if (q == me) continue;
            PartnerRef partner = new PartnerRef(q.conceptId(), q.tradeName(), q.index());
            for (Substance s : me.substances())
                for (Substance t : q.substances()) {
                    if (sameSubstance(s, t)) continue;
                    Use us = use(s, me.route(), complete), ut = use(t, q.route(), complete);
                    if (us.reason() == null && ut.reason() == null) {
                        for (String a : us.chosen())
                            for (String b : ut.chosen()) {
                                PairRow row = byKey.get(key(a, b));
                                if (row == null) continue;
                                Pair old = pairs.get(key(a, b));
                                pairs.put(key(a, b), old == null
                                    ? new Pair(row.ddinterA(), row.ddinterB(), row.nameA(), row.nameB(), s.name(), t.name(), row.severity(),
                                        row.actions(), row.interaction(), row.management(), List.of(partner))
                                    : withPartner(old, partner));
                            }
                        continue;
                    }
                    boolean thisSide = ut.reason() == null || (us.reason() != null
                        && REASON_ORDER.indexOf(us.reason()) <= REASON_ORDER.indexOf(ut.reason()));
                    String reason = thisSide ? us.reason() : ut.reason();
                    String side = thisSide ? "this" : "partner";
                    // Spec §5.6.2/§6.7.3: the line names the route of the record the reason applies to, so partners that
                    // differ by route must not merge (a null route stays apart from a named one).
                    String k = s.name() + "|" + t.name() + "|" + reason + "|" + side
                        + (thisSide ? "" : "|" + String.valueOf(q.route()));
                    NotChecked old = notChecked.get(k);
                    notChecked.put(k, old == null
                        ? new NotChecked(s.name(), t.name(), List.of(partner), reason, side, thisSide ? me.route() : q.route())
                        : new NotChecked(old.substance(), old.partnerSubstance(), plus(old.partners(), partner), reason, side, old.route()));
                }
        }
        List<Substance> own = me.substances();
        for (int i = 0; i < own.size(); i++)
            for (int j = i + 1; j < own.size(); j++)
                if (!sameSubstance(own.get(i), own.get(j)))
                    notChecked.put(own.get(i).name() + "|" + own.get(j).name() + "|same_product",
                        new NotChecked(own.get(i).name(), own.get(j).name(), List.of(), "same_product", "this", me.route()));

        List<Pair> sorted = new ArrayList<>(pairs.values());
        sorted.sort(Comparator.comparingInt((Pair x) -> severityRank(x.severity()))
            .thenComparing(x -> x.partnerSubstance().toLowerCase(Locale.ROOT))
            .thenComparing(Pair::ddinterA).thenComparing(Pair::ddinterB));
        return new Result(batch.size(), List.copyOf(sorted), List.copyOf(notChecked.values()));
    }

    private static Pair withPartner(Pair p, PartnerRef ref) {
        return new Pair(p.ddinterA(), p.ddinterB(), p.nameA(), p.nameB(), p.substance(), p.partnerSubstance(), p.severity(),
            p.actions(), p.interaction(), p.management(), plus(p.partners(), ref));
    }

    private static List<PartnerRef> plus(List<PartnerRef> list, PartnerRef ref) {
        if (list.contains(ref)) return list;
        List<PartnerRef> out = new ArrayList<>(list);
        out.add(ref);
        out.sort(Comparator.comparingInt(PartnerRef::index));
        return List.copyOf(out);
    }
}
