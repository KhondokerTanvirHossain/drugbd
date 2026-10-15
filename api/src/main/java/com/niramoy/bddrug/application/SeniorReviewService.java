package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.SeniorReviewPort;
import com.niramoy.bddrug.application.port.SeniorReviewPort.HeldRow;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairQueue;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.RouteRule;
import com.niramoy.bddrug.domain.SeniorViews;
import com.niramoy.bddrug.domain.SeniorViews.PairView;
import com.niramoy.bddrug.domain.SourceLinks;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;

/**
 * Senior clinical review (spec §5.17, §7.7). Every read covers all batches at once: the held products (latest current
 * item, never removed), every stored pair between held substances (PO D3(b)), each pair's state from PairReviewRule.
 * The universe is assembled from a fixed number of set-based queries; only the shown page gets texts, brands and history.
 */
@Service
public class SeniorReviewService {
    public static final int SIZE_DEFAULT = 50, SIZE_MAX = 100, PAGE_MAX = 10_000, BRANDS_SHOWN = 10, Q_MAX = 100;

    protected final SeniorReviewPort port;
    public SeniorReviewService(SeniorReviewPort port) { this.port = port; }

    record Product(String conceptId, String batchId, String tradeName, String review, Instant extractedAt, String bdcId,
                   String clinicalName, String route, List<BatchPairs.Substance> substances) {}
    record Universe(Map<String, Product> products, Map<String, String> substanceNames, Map<String, String> bdsOfCode,
                    Map<String, DdinterCode> codeInfo, Map<String, List<Product>> choosers, List<PairQueue.Entry> entries,
                    Map<String, List<PairReviewRule.Decision>> reviews) {}

    private static final Comparator<Product> BRAND_ORDER = Comparator.comparing(Product::batchId)
        .thenComparing(p -> p.tradeName().toLowerCase(Locale.ROOT)).thenComparing(Product::conceptId);

    // ---- parameters

    static String oneOf(String value, String fallback, List<String> allowed, String field) {
        String v = value == null ? fallback : value;
        if (v == null) return null;
        if (!allowed.contains(v)) throw new InvalidQueryException(field, field + " must be one of " + String.join(", ", allowed));
        return v;
    }

    private record Paging(int page, int size) {
        <T> List<T> slice(List<T> all) { return all.stream().skip((long) page * size).limit(size).toList(); }
    }

    private static Paging paging(String page, String size) {
        return new Paging(ReviewQueryService.number(page, 0, 0, PAGE_MAX, "page"),
            ReviewQueryService.number(size, SIZE_DEFAULT, 1, SIZE_MAX, "size"));
    }

    // ---- the universe

    Mono<Universe> universe(String viewerEmail) {
        return port.held().flatMap(rows -> {
            Set<String> bds = new HashSet<>();
            for (HeldRow r : rows) if (r.bdsId() != null) bds.add(r.bdsId());
            return port.ddinterCodes(bds).flatMap(codes -> {
                Map<String, List<DdinterCode>> byBds = new HashMap<>();
                Map<String, String> bdsOfCode = new TreeMap<>();
                Map<String, DdinterCode> codeInfo = new HashMap<>();
                for (SeniorReviewPort.Code c : codes) {
                    DdinterCode dc = new DdinterCode(c.code(), c.routeScope());
                    byBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(dc);
                    bdsOfCode.merge(c.code(), c.bdsId(), (x, y) -> x.compareTo(y) <= 0 ? x : y);
                    codeInfo.putIfAbsent(c.code(), dc);
                }
                Map<String, Product> products = products(rows, byBds);
                Map<String, String> names = new HashMap<>();
                for (Product p : products.values())
                    for (BatchPairs.Substance s : p.substances()) if (s.bdsId() != null) names.putIfAbsent(s.bdsId(), s.name());
                Map<String, List<Product>> choosers = new HashMap<>();
                for (Product p : products.values())
                    for (BatchPairs.Substance s : p.substances())
                        RouteRule.choose(s.codes(), p.route()).ifPresent(choice ->
                            choice.codes().forEach(c -> choosers.computeIfAbsent(c.code(), k -> new ArrayList<>()).add(p)));
                return Mono.zip(port.pairsAmong(bdsOfCode.keySet()), port.reviews(bdsOfCode.keySet(), viewerEmail)).flatMap(t -> {
                    Map<String, List<PairReviewRule.Decision>> reviews = t.getT2();
                    Set<String> as = new HashSet<>(), bs = new HashSet<>();
                    for (String k : reviews.keySet()) { String[] ab = k.split("\\|"); as.add(ab[0]); bs.add(ab[1]); }
                    return port.pairDetails(as, bs).map(rowsWithText -> {
                        Map<String, String> hashes = new HashMap<>();
                        for (BatchPairs.PairRow r : rowsWithText) hashes.put(r.ddinterA() + "|" + r.ddinterB(), hash(r));
                        List<PairQueue.Entry> entries = new ArrayList<>();
                        for (SeniorReviewPort.PairLite p : t.getT1()) {
                            String bdsA = bdsOfCode.get(p.ddinterA()), bdsB = bdsOfCode.get(p.ddinterB()), key = p.ddinterA() + "|" + p.ddinterB();
                            List<PairReviewRule.Decision> ds = reviews.getOrDefault(key, List.of());
                            String state = ds.isEmpty() ? PairReviewRule.NOT_REVIEWED : PairReviewRule.review(ds, hashes.get(key)).state();
                            entries.add(new PairQueue.Entry(p.ddinterA(), p.ddinterB(), p.severity(), bdsA, names.getOrDefault(bdsA, bdsA),
                                bdsB, names.getOrDefault(bdsB, bdsB), choosers.containsKey(p.ddinterA()) && choosers.containsKey(p.ddinterB()),
                                state));
                        }
                        return new Universe(products, names, bdsOfCode, codeInfo, choosers, List.copyOf(entries), reviews);
                    });
                });
            });
        });
    }

    private static Map<String, Product> products(List<HeldRow> rows, Map<String, List<DdinterCode>> byBds) {
        Map<String, List<HeldRow>> byConcept = new LinkedHashMap<>();
        for (HeldRow r : rows) byConcept.computeIfAbsent(r.conceptId(), k -> new ArrayList<>()).add(r);
        Map<String, Product> out = new LinkedHashMap<>();
        for (List<HeldRow> group : byConcept.values()) {
            HeldRow f = group.get(0);
            List<BatchPairs.Substance> subs = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (HeldRow r : group) {
                if (r.xmCode() == null || (r.bdsId() != null && !seen.add(r.bdsId()))) continue;
                subs.add(new BatchPairs.Substance(r.bdsId(), r.substance() != null ? r.substance() : r.ingredientName(), r.coverage(),
                    r.bdsId() == null ? List.of() : List.copyOf(byBds.getOrDefault(r.bdsId(), List.of()))));
            }
            out.put(f.conceptId(), new Product(f.conceptId(), f.batchId(), f.tradeName(), f.review(), f.extractedAt(), f.bdcId(),
                f.clinicalName(), f.route(), List.copyOf(subs)));
        }
        return out;
    }

    static String hash(BatchPairs.PairRow r) {
        return PairContent.hash(r.ddinterA(), r.ddinterB(), content(r));
    }

    static PairContent.Content content(BatchPairs.PairRow r) {
        return new PairContent.Content(r.severity(), r.actions(), r.interaction(), r.management());
    }

    // ---- views of one page of pairs

    private record Sides(List<Product> a, List<Product> b) {}

    private Sides sides(Universe u, PairQueue.Entry e) {
        return new Sides(u.choosers().getOrDefault(e.ddinterA(), List.of()).stream().sorted(BRAND_ORDER).toList(),
            u.choosers().getOrDefault(e.ddinterB(), List.of()).stream().sorted(BRAND_ORDER).toList());
    }

    private static String itemKey(Product p) { return p.batchId() + "|" + p.conceptId(); }

    private static String displayStatus(Product p, Map<String, List<ReviewDecision>> decisions) {
        return ApprovalRule.displayStatus(decisions.getOrDefault(itemKey(p), List.of()), p.extractedAt(), p.review());
    }

    Mono<List<PairView>> views(Universe u, List<PairQueue.Entry> page) {
        if (page.isEmpty()) return Mono.just(List.of());
        Set<String> as = new HashSet<>(), bs = new HashSet<>(), codes = new HashSet<>(), items = new HashSet<>();
        Map<String, Sides> sides = new HashMap<>();
        for (PairQueue.Entry e : page) {
            as.add(e.ddinterA()); bs.add(e.ddinterB()); codes.add(e.ddinterA()); codes.add(e.ddinterB());
            Sides s = sides(u, e);
            sides.put(e.key(), s);
            s.a().stream().limit(BRANDS_SHOWN).forEach(p -> items.add(itemKey(p)));
            s.b().stream().limit(BRANDS_SHOWN).forEach(p -> items.add(itemKey(p)));
        }
        return Mono.zip(port.pairDetails(as, bs), port.entries(codes), port.decisions(items)).map(t -> {
            Map<String, BatchPairs.PairRow> rows = new HashMap<>();
            for (BatchPairs.PairRow r : t.getT1()) rows.put(r.ddinterA() + "|" + r.ddinterB(), r);
            List<PairView> out = new ArrayList<>();
            for (PairQueue.Entry e : page) {
                BatchPairs.PairRow row = rows.get(e.key());
                if (row == null) continue;   // deleted since the universe was read: never happens (the ETL never deletes pairs)
                PairContent.Content content = content(row);
                String hash = PairContent.hash(e.ddinterA(), e.ddinterB(), content);
                List<PairReviewRule.Decision> ds = u.reviews().getOrDefault(e.key(), List.of());
                Sides s = sides.get(e.key());
                List<SeniorViews.Brand> brands = new ArrayList<>();
                s.a().stream().limit(BRANDS_SHOWN).forEach(p -> brands.add(new SeniorViews.Brand(p.conceptId(), p.tradeName(), p.batchId(),
                    displayStatus(p, t.getT3()), "a")));
                s.b().stream().limit(BRANDS_SHOWN).forEach(p -> brands.add(new SeniorViews.Brand(p.conceptId(), p.tradeName(), p.batchId(),
                    displayStatus(p, t.getT3()), "b")));
                Set<String> batches = new HashSet<>();
                s.a().forEach(p -> batches.add(p.batchId()));
                s.b().forEach(p -> batches.add(p.batchId()));
                out.add(new PairView(e.ddinterA(), e.ddinterB(), new SeniorViews.Side(e.bdsA(), e.nameA()),
                    new SeniorViews.Side(e.bdsB(), e.nameB()), entryRef(u, t.getT2(), e.ddinterA(), row.nameA()),
                    entryRef(u, t.getT2(), e.ddinterB(), row.nameB()), row.severity(), row.actions(), content.interaction(),
                    content.management(), SourceLinks.pair(row.interactionId()).orElse(null), e.applies(), List.copyOf(brands),
                    new SeniorViews.BrandCounts(s.a().size(), s.b().size(), batches.size()), PairReviewRule.review(ds, hash),
                    PairReviewRule.changes(ds, content, hash), PairReviewRule.history(ds, hash),
                    new SeniorViews.PairVersion(hash, PairReviewRule.lastId(ds))));
            }
            return List.copyOf(out);
        });
    }

    private static SeniorViews.EntryRef entryRef(Universe u, Map<String, SeniorReviewPort.EntryInfo> entries, String id, String partnerName) {
        SeniorReviewPort.EntryInfo info = entries.get(id);
        DdinterCode code = u.codeInfo().get(id);
        return new SeniorViews.EntryRef(info != null && info.name() != null ? info.name() : partnerName, code == null ? null : code.routeScope(),
            SourceLinks.code("DDINTER", id, info == null ? null : info.fetchedAt()).orElse(null));
    }

    // ---- GET /v1/review/pairs

    public Mono<SeniorViews.PairsPage> pairs(String show, String scope, String severity, String page, String size, String viewerEmail) {
        return Mono.fromCallable(() -> new Object[]{oneOf(show, "todo", PairQueue.SHOWS, "show"), oneOf(scope, "all", PairQueue.SCOPES, "pairs"),
                oneOf(severity, null, PairQueue.SEVERITIES, "severity"), paging(page, size)})
            .flatMap(v -> universe(viewerEmail).flatMap(u -> {
                List<PairQueue.Entry> selected = PairQueue.select(u.entries(), (String) v[0], (String) v[1], (String) v[2]);
                return views(u, ((Paging) v[3]).slice(selected))
                    .map(items -> new SeniorViews.PairsPage(selected.size(), PairQueue.counts(u.entries(), (String) v[1]), items));
            }));
    }

    // ---- GET /v1/review/substances

    public Mono<SeniorViews.SubstancesPage> substances(String q, String page, String size) {
        return Mono.fromCallable(() -> {
                String needle = q == null ? "" : q.strip();
                if (Validate.length(needle) > Q_MAX) throw new InvalidQueryException("q", "q must be at most " + Q_MAX + " characters");
                return new Object[]{needle.toLowerCase(Locale.ROOT), paging(page, size)};
            })
            .flatMap(v -> universe(null).map(u -> {
                String needle = (String) v[0];
                Map<String, List<Product>> carrying = carrying(u);
                List<SeniorViews.SubstanceRow> rows = new ArrayList<>();
                for (Map.Entry<String, List<Product>> c : carrying.entrySet()) {
                    String bds = c.getKey(), name = u.substanceNames().getOrDefault(bds, bds);
                    if (!needle.isEmpty() && !name.toLowerCase(Locale.ROOT).contains(needle) && !bds.toLowerCase(Locale.ROOT).contains(needle)) continue;
                    List<PairQueue.Entry> todo = u.entries().stream().filter(e -> PairQueue.inShow("todo", e.state())
                        && (bds.equals(e.bdsA()) || bds.equals(e.bdsB()))).toList();
                    rows.add(new SeniorViews.SubstanceRow(bds, name, c.getValue().size(),
                        (int) c.getValue().stream().map(Product::batchId).distinct().count(), todo.size(),
                        (int) todo.stream().filter(e -> "major".equals(e.severity())).count()));
                }
                rows.sort(Comparator.comparingInt(SeniorViews.SubstanceRow::pairsToReview).reversed()
                    .thenComparing(r -> r.name().toLowerCase(Locale.ROOT)).thenComparing(SeniorViews.SubstanceRow::bdsId));
                return new SeniorViews.SubstancesPage(rows.size(), ((Paging) v[1]).slice(rows));
            }));
    }

    /** Held products by substance (bds_id), in the held order. */
    private static Map<String, List<Product>> carrying(Universe u) {
        Map<String, List<Product>> out = new LinkedHashMap<>();
        for (Product p : u.products().values())
            for (BatchPairs.Substance s : p.substances()) if (s.bdsId() != null) out.computeIfAbsent(s.bdsId(), k -> new ArrayList<>()).add(p);
        return out;
    }

    // ---- GET /v1/review/substances/{bdsId}

    public Mono<SeniorViews.SubstanceDetail> substance(String bdsId, String scope, String severity, String page, String size,
                                                       String viewerEmail) {
        return Mono.fromCallable(() -> new Object[]{oneOf(scope, "all", PairQueue.SCOPES, "pairs"),
                oneOf(severity, null, PairQueue.SEVERITIES, "severity"), paging(page, size)})
            .flatMap(v -> universe(viewerEmail).flatMap(u -> {
                List<Product> brands = carrying(u).get(bdsId);
                if (brands == null) return Mono.error(new NotFoundException("bdsId", "No substance with this id is held"));
                List<Product> sorted = brands.stream().sorted(BRAND_ORDER).toList();
                List<PairQueue.Entry> selected = PairQueue.select(u.entries().stream()
                    .filter(e -> bdsId.equals(e.bdsA()) || bdsId.equals(e.bdsB())).toList(), "all", (String) v[0], (String) v[1]);
                Set<String> bdc = new HashSet<>();
                sorted.forEach(p -> { if (p.bdcId() != null) bdc.add(p.bdcId()); });
                return Mono.zip(port.substance(bdsId), port.strengths(bdc, bdsId),
                        port.decisions(sorted.stream().map(SeniorReviewService::itemKey).toList()),
                        views(u, ((Paging) v[2]).slice(selected)))
                    .map(t -> new SeniorViews.SubstanceDetail(bdsId, t.getT1().name(), t.getT1().names(), t.getT1().codes(),
                        t.getT1().coverage(), t.getT1().entries(),
                        sorted.stream().map(p -> brandRow(p, bdsId, t.getT2(), t.getT3())).toList(),
                        new SeniorViews.PairList(selected.size(), t.getT4())));
            }));
    }

    private static SeniorViews.BrandRow brandRow(Product p, String bdsId, Map<String, String> strengths,
                                                 Map<String, List<ReviewDecision>> decisions) {
        BatchPairs.Substance s = p.substances().stream().filter(x -> bdsId.equals(x.bdsId())).findFirst().orElseThrow();
        Optional<RouteRule.Choice> choice = RouteRule.choose(s.codes(), p.route());
        List<SeniorViews.Chosen> chosen = choice.map(c -> c.codes().stream()
            .map(x -> new SeniorViews.Chosen(x.code(), x.routeScope(), c.routeAssumed())).toList()).orElse(List.of());
        String reason = "none".equals(s.coverage()) ? "no_data" : !"full".equals(s.coverage()) ? "not_run" : chosen.isEmpty() ? "no_route" : null;
        return new SeniorViews.BrandRow(p.conceptId(), p.tradeName(), p.batchId(), displayStatus(p, decisions),
            p.bdcId() == null ? null : new SeniorViews.Clinical(p.bdcId(), p.clinicalName(), p.route()),
            p.bdcId() == null ? "" : strengths.getOrDefault(p.bdcId(), ""), reason == null ? chosen : List.of(), reason);
    }
}
