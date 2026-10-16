package com.niramoy.bddrug.domain;
import java.util.*;

/**
 * §6.5 "With other approved medicines" and §7.4 P10 (D60): this product's DDInter pairs with every other public product
 * of any batch, grouped by partner substance, with RouteRule on both sides (BatchPairs.use, one rule). Pure. Linear in
 * partners × substances; no batch-wide count. The partners arrive either as products ({@link #compute}) or already grouped
 * by partner substance and route with their first BRANDS_MAX brands and a full count ({@link #computeGroups}, what P10's
 * adapter reads, so a call never holds every public product); both give the same result.
 */
public final class PublicPairs {
    private PublicPairs() {}

    public static final int PAGE_SIZE = 20, BRANDS_MAX = 50;
    public static final String SOURCE = "DDInter 2.0";

    public record Partner(String conceptId, String tradeName, String route, List<BatchPairs.Substance> substances) {}
    public record Row(String ddinterA, String ddinterB, String severity, List<String> actions, String interaction, String management) {
        public Row {
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }
    public record SubstanceRef(String bdsId, String name) {}
    public record Brand(String conceptId, String tradeName) {}
    /**
     * The public products (other than this one) that carry one partner substance at one route: they all pair, or fail to,
     * alike. {@code brands} holds at least the first BRANDS_MAX of them in brand order (lower-case trade name, then concept
     * id); {@code brandCount} counts them all. No product is in two groups of one substance.
     */
    public record PartnerGroup(BatchPairs.Substance substance, String route, List<Brand> brands, int brandCount) {
        public PartnerGroup { brands = List.copyOf(brands); }
    }
    public record Pair(SubstanceRef substance, SubstanceRef partnerSubstance, String severity, List<String> actions, String interaction,
                       String management, String ddinterA, String ddinterB, boolean routeAssumed, String source,
                       PairReviewRule.PublicReview pairReview, List<Brand> brands, int brandCount) {}
    /**
     * route: for no_route, the route of the side the reason is on (this product's, or the partner brands', which they
     * share), else null. side: "this" when the reason is this product's substance's (§6.7.2 REASON_ORDER, this side on a
     * tie, as BatchPairs), else "partner". brands are always the partner brands the line covers.
     */
    public record NotChecked(SubstanceRef substance, SubstanceRef partnerSubstance, String reason, String route, List<Brand> brands,
                             int brandCount, String side) {
        public NotChecked(SubstanceRef substance, SubstanceRef partnerSubstance, String reason, String route, List<Brand> brands,
                          int brandCount) {
            this(substance, partnerSubstance, reason, route, brands, brandCount, "partner");
        }
    }
    public record Result(String conceptId, int page, int totalPartners, List<Pair> partners, List<NotChecked> notChecked) {}

    private static final Comparator<Brand> BRAND_ORDER = Comparator
        .comparing((Brand b) -> b.tradeName().toLowerCase(Locale.ROOT)).thenComparing(Brand::conceptId);

    /** The brands of one pair or line: the groups that reach it, each counted once (a group's products are its own). */
    private static final class Brands {
        final Map<String, Brand> byId = new LinkedHashMap<>();
        final Set<PartnerGroup> groups = Collections.newSetFromMap(new IdentityHashMap<>());
        int count;
        void add(PartnerGroup q) {
            if (!groups.add(q)) return;
            count += q.brandCount();
            for (Brand b : q.brands()) byId.putIfAbsent(b.conceptId(), b);
        }
        List<Brand> capped() { return byId.values().stream().sorted(BRAND_ORDER).limit(BRANDS_MAX).toList(); }
    }
    private static final class PairAcc {
        final Row row; final Brands brands = new Brands(); boolean assumed;
        PairAcc(Row row) { this.row = row; }
    }
    private static final class NcAcc {
        final String reason, route, side; final Brands brands = new Brands();
        NcAcc(String reason, String route, String side) { this.reason = reason; this.route = route; this.side = side; }
    }
    private static final class Group {
        final SubstanceRef substance, partner;
        final Map<String, PairAcc> pairs = new LinkedHashMap<>();
        final Map<String, NcAcc> notChecked = new LinkedHashMap<>();
        Group(SubstanceRef substance, SubstanceRef partner) { this.substance = substance; this.partner = partner; }
        int rank() {
            if (!pairs.isEmpty()) return pairs.values().stream().mapToInt(p -> Severity.rank(p.row.severity())).min().orElse(3);
            return notChecked.values().stream().anyMatch(n -> "no_data".equals(n.reason)) ? 4 : 5;
        }
    }

    private static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }
    private static SubstanceRef ref(BatchPairs.Substance s) { return new SubstanceRef(s.bdsId(), s.name()); }
    private static boolean assumed(BatchPairs.Substance s, String route) {
        return RouteRule.choose(s.codes(), route).map(RouteRule.Choice::routeAssumed).orElse(false);
    }

    /** The partners as products: grouped here by partner substance and route (in first-seen order), then {@link #computeGroups}. */
    public static Result compute(String conceptId, String route, List<BatchPairs.Substance> mine, List<Partner> partners, List<Row> rows,
                                 Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews, int page) {
        Map<List<Object>, Map<String, Brand>> byGroup = new LinkedHashMap<>();
        for (Partner q : partners) {
            if (q.conceptId().equals(conceptId)) continue;
            for (BatchPairs.Substance t : q.substances())
                byGroup.computeIfAbsent(Arrays.asList(t, q.route()), k -> new LinkedHashMap<>())
                    .putIfAbsent(q.conceptId(), new Brand(q.conceptId(), q.tradeName()));
        }
        List<PartnerGroup> groups = new ArrayList<>();
        byGroup.forEach((k, brands) -> groups.add(new PartnerGroup((BatchPairs.Substance) k.get(0), (String) k.get(1),
            brands.values().stream().sorted(BRAND_ORDER).limit(BRANDS_MAX).toList(), brands.size())));
        return computeGroups(conceptId, route, mine, groups, rows, complete, reviews, page);
    }

    /** The partners as groups (§7.4 P10's adapter), in the order their first product is read; this product is in none. */
    public static Result computeGroups(String conceptId, String route, List<BatchPairs.Substance> mine, List<PartnerGroup> partners,
                                       List<Row> rows, Set<String> complete, Map<String, PairReviewRule.PublicReview> reviews, int page) {
        Map<String, Row> byKey = new HashMap<>();
        for (Row r : rows) byKey.put(key(r.ddinterA(), r.ddinterB()), r);
        Map<String, Group> groups = new LinkedHashMap<>();
        for (BatchPairs.Substance s : mine) {
            // An unusable substance of this product is never dropped (G3): each partner gets a not-checked line (§6.7.2 rule 1).
            BatchPairs.Use us = BatchPairs.use(s, route, complete);
            boolean sAssumed = us.reason() == null && assumed(s, route);
            String sk = s.bdsId() != null ? s.bdsId() : "name:" + s.name();
            for (PartnerGroup q : partners) {
                BatchPairs.Substance t = q.substance();
                if (t.bdsId() != null && t.bdsId().equals(s.bdsId())) continue;
                String gk = sk + "|" + (t.bdsId() != null ? t.bdsId() : "name:" + t.name());
                Group g = groups.computeIfAbsent(gk, k -> new Group(ref(s), ref(t)));
                BatchPairs.Use ut = BatchPairs.use(t, q.route(), complete);
                if (us.reason() != null || ut.reason() != null) {
                    boolean mineSide = BatchPairs.reasonOnThisSide(us.reason(), ut.reason());
                    String r = mineSide ? us.reason() : ut.reason(), side = mineSide ? "this" : "partner";
                    String rt = "no_route".equals(r) ? (mineSide ? route : q.route()) : null;
                    g.notChecked.computeIfAbsent(r + "|" + rt + "|" + side, k -> new NcAcc(r, rt, side)).brands.add(q);
                    continue;
                }
                boolean tAssumed = assumed(t, q.route());
                for (String a : us.chosen())
                    for (String b : ut.chosen()) {
                        Row row = byKey.get(key(a, b));
                        if (row == null) continue;
                        PairAcc acc = g.pairs.computeIfAbsent(key(a, b), k -> new PairAcc(row));
                        acc.brands.add(q);
                        acc.assumed |= sAssumed || tAssumed;
                    }
            }
        }
        List<Group> ordered = groups.values().stream().filter(g -> !g.pairs.isEmpty() || !g.notChecked.isEmpty())
            .sorted(Comparator.comparingInt(Group::rank)
                .thenComparing(g -> g.partner.name().toLowerCase(Locale.ROOT))
                .thenComparing(g -> g.substance.name().toLowerCase(Locale.ROOT)))
            .toList();
        int from = Math.min(page * PAGE_SIZE, ordered.size()), to = Math.min(from + PAGE_SIZE, ordered.size());
        List<Pair> pairs = new ArrayList<>();
        List<NotChecked> notChecked = new ArrayList<>();
        for (Group g : ordered.subList(from, to)) {
            g.pairs.values().stream()
                .sorted(Comparator.comparingInt((PairAcc p) -> Severity.rank(p.row.severity()))
                    .thenComparing(p -> p.row.ddinterA()).thenComparing(p -> p.row.ddinterB()))
                .forEach(p -> pairs.add(new Pair(g.substance, g.partner, p.row.severity(), p.row.actions(), p.row.interaction(),
                    p.row.management(), p.row.ddinterA(), p.row.ddinterB(), p.assumed, SOURCE,
                    reviews.getOrDefault(p.row.ddinterA() + "|" + p.row.ddinterB(), PublicPairReviews.NONE),
                    p.brands.capped(), p.brands.count)));
            g.notChecked.values().stream()
                .sorted(Comparator.comparingInt((NcAcc n) -> BatchPairs.REASON_ORDER.indexOf(n.reason))
                    .thenComparing(n -> n.side).thenComparing(n -> String.valueOf(n.route)))
                .forEach(n -> notChecked.add(new NotChecked(g.substance, g.partner, n.reason, n.route, n.brands.capped(),
                    n.brands.count, n.side)));
        }
        return new Result(conceptId, page, ordered.size(), List.copyOf(pairs), List.copyOf(notChecked));
    }
}
