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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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

    /**
     * A held product; its review state is read only when a page shows it (SeniorReviewPort.itemStates). {@code nameKey} is
     * the trade name lower-cased (Locale.ROOT), computed once for BRAND_ORDER.
     */
    record Product(String conceptId, String batchId, String tradeName, String nameKey, String bdcId, String clinicalName, String route,
                   List<BatchPairs.Substance> substances) {}
    /**
     * {@code bdsOfCode}: every held substance a DDInter code is mapped to (V3 allows several), sorted; {@code codesOfBds}: each
     * held substance's own DDInter codes; {@code codeInfo}: code → bds_id → that mapping (its route scope).
     */
    record Universe(List<Product> products, Map<String, String> substanceNames, Map<String, Set<String>> bdsOfCode,
                    Map<String, Set<String>> codesOfBds, Map<String, Map<String, DdinterCode>> codeInfo,
                    Map<String, List<Product>> choosers, List<PairQueue.Entry> entries,
                    Map<String, List<PairReviewRule.Decision>> reviews) {}

    /** Batch, trade name ignoring case, concept id (§5.17.2 "ordered by batch, then trade name"). */
    static final Comparator<Product> BRAND_ORDER = Comparator.comparing(Product::batchId).thenComparing(Product::nameKey)
        .thenComparing(Product::conceptId);

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

    /**
     * Two independent reads run side by side (§10.6): the held rows, and the chain DDInter codes of the held substances →
     * stored pairs among them and their pair reviews → the texts of the reviewed pairs (exact pairs, for the hash).
     */
    Mono<Universe> universe(String viewerEmail) {
        Mono<Pairs> pairs = port.heldDdinterCodes().flatMap(codes -> {
            Set<String> all = new TreeSet<>();
            for (SeniorReviewPort.Code c : codes) all.add(c.code());
            return Mono.zip(port.pairsAmong(all), port.reviews(all, viewerEmail)).flatMap(t -> {
                List<String> as = new ArrayList<>(), bs = new ArrayList<>();
                for (String k : t.getT2().keySet()) { int i = k.indexOf('|'); as.add(k.substring(0, i)); bs.add(k.substring(i + 1)); }
                return port.pairDetails(as, bs).map(texts -> new Pairs(codes, t.getT1(), t.getT2(), texts));
            });
        });
        return Mono.zip(port.held(), pairs).map(t -> build(t.getT1(), t.getT2()));
    }

    private record Pairs(List<SeniorReviewPort.Code> codes, List<SeniorReviewPort.PairLite> stored,
                         Map<String, List<PairReviewRule.Decision>> reviews, List<BatchPairs.PairRow> reviewedTexts) {}

    private static Universe build(List<HeldRow> rows, Pairs read) {
        Set<String> held = new HashSet<>();
        for (HeldRow r : rows) if (r.bdsId() != null) held.add(r.bdsId());
        Map<String, List<DdinterCode>> byBds = new HashMap<>();
        Map<String, Set<String>> bdsOfCode = new TreeMap<>(), codesOfBds = new HashMap<>();
        Map<String, Map<String, DdinterCode>> codeInfo = new HashMap<>();
        for (SeniorReviewPort.Code c : read.codes()) {
            if (!held.contains(c.bdsId())) continue;   // the two reads are separate statements: keep only what both agree is held
            DdinterCode dc = new DdinterCode(c.code(), c.routeScope());
            byBds.computeIfAbsent(c.bdsId(), k -> new ArrayList<>()).add(dc);
            bdsOfCode.computeIfAbsent(c.code(), k -> new TreeSet<>()).add(c.bdsId());
            codesOfBds.computeIfAbsent(c.bdsId(), k -> new HashSet<>()).add(c.code());
            codeInfo.computeIfAbsent(c.code(), k -> new HashMap<>()).put(c.bdsId(), dc);
        }
        List<Product> products = products(rows, byBds);
        Map<String, String> names = new HashMap<>();
        Map<String, List<Product>> choosers = new HashMap<>();
        Map<String, Optional<RouteRule.Choice>> choices = new HashMap<>();   // one RouteRule call per (substance, route)
        for (Product p : products)
            for (BatchPairs.Substance s : p.substances()) {
                if (s.bdsId() == null) continue;
                names.putIfAbsent(s.bdsId(), s.name());
                choices.computeIfAbsent(s.bdsId() + "|" + p.route(), k -> RouteRule.choose(s.codes(), p.route())).ifPresent(choice ->
                    choice.codes().forEach(c -> choosers.computeIfAbsent(c.code(), k -> new ArrayList<>()).add(p)));
            }
        Map<String, String> hashes = new HashMap<>();
        for (BatchPairs.PairRow r : read.reviewedTexts()) hashes.put(r.ddinterA() + "|" + r.ddinterB(), hash(r));
        List<PairQueue.Entry> entries = new ArrayList<>();
        for (SeniorReviewPort.PairLite p : read.stored()) {
            // One entry per stored pair; its side labels are the smallest mapped bds_id (deterministic).
            String bdsA = first(bdsOfCode.get(p.ddinterA())), bdsB = first(bdsOfCode.get(p.ddinterB()));
            if (bdsA == null || bdsB == null) continue;
            String key = p.ddinterA() + "|" + p.ddinterB();
            List<PairReviewRule.Decision> ds = read.reviews().getOrDefault(key, List.of());
            String state = ds.isEmpty() ? PairReviewRule.NOT_REVIEWED : PairReviewRule.review(ds, hashes.get(key)).state();
            entries.add(new PairQueue.Entry(p.ddinterA(), p.ddinterB(), p.severity(), bdsA, names.getOrDefault(bdsA, bdsA),
                bdsB, names.getOrDefault(bdsB, bdsB), choosers.containsKey(p.ddinterA()) && choosers.containsKey(p.ddinterB()), state));
        }
        return new Universe(products, names, bdsOfCode, codesOfBds, codeInfo, choosers, List.copyOf(entries), read.reviews());
    }

    private static String first(Set<String> sorted) { return sorted == null || sorted.isEmpty() ? null : sorted.iterator().next(); }

    /** Whether a pair belongs to a substance: one of its two entries is one of that substance's own DDInter codes. */
    private static boolean involves(Universe u, String bdsId, PairQueue.Entry e) {
        Set<String> codes = u.codesOfBds().getOrDefault(bdsId, Set.of());
        return codes.contains(e.ddinterA()) || codes.contains(e.ddinterB());
    }

    /**
     * One Product per held product (unordered; lists are put in BRAND_ORDER where they are shown). Its substances are the
     * held substances behind its XM codes, in XM-code order, one per bds_id; an ingredient with no substance is left out (no
     * senior read shows it). Products with the same XM codes share one substance list.
     */
    private static List<Product> products(List<HeldRow> rows, Map<String, List<DdinterCode>> byBds) {
        Map<String, List<HeldRow>> byConcept = new HashMap<>(rows.size() * 2);
        for (HeldRow r : rows) byConcept.computeIfAbsent(r.conceptId(), k -> new ArrayList<>(1)).add(r);
        Map<String, List<BatchPairs.Substance>> shared = new HashMap<>();
        List<Product> out = new ArrayList<>(byConcept.size());
        for (List<HeldRow> group : byConcept.values()) {
            if (group.size() > 1) group.sort(Comparator.comparing(HeldRow::xmCode, Comparator.nullsLast(Comparator.naturalOrder())));
            HeldRow f = group.get(0);
            String key = f.xmCode();
            if (group.size() > 1) {
                StringBuilder b = new StringBuilder();
                for (HeldRow r : group) b.append(r.xmCode()).append(',');
                key = b.toString();
            }
            List<BatchPairs.Substance> subs = shared.computeIfAbsent(String.valueOf(key), k -> {
                List<BatchPairs.Substance> list = new ArrayList<>();
                Set<String> seen = new HashSet<>();
                for (HeldRow r : group)
                    if (r.bdsId() != null && seen.add(r.bdsId()))
                        list.add(new BatchPairs.Substance(r.bdsId(), r.substance(), r.coverage(), List.copyOf(byBds.getOrDefault(r.bdsId(), List.of()))));
                return List.copyOf(list);
            });
            out.add(new Product(f.conceptId(), f.batchId(), f.tradeName(), f.tradeName().toLowerCase(Locale.ROOT), f.bdcId(),
                f.clinicalName(), f.route(), subs));
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

    /** The held products that choose each side's entry, in BRAND_ORDER; each code's list is sorted once per call. */
    private static Sides sides(Universe u, PairQueue.Entry e, Map<String, List<Product>> sorted) {
        return new Sides(chooserList(u, e.ddinterA(), sorted), chooserList(u, e.ddinterB(), sorted));
    }

    private static List<Product> chooserList(Universe u, String code, Map<String, List<Product>> sorted) {
        return sorted.computeIfAbsent(code, c -> u.choosers().getOrDefault(c, List.of()).stream().sorted(BRAND_ORDER).toList());
    }

    private static String itemKey(Product p) { return p.batchId() + "|" + p.conceptId(); }

    private static String displayStatus(Product p, Map<String, SeniorReviewPort.ItemState> states, Map<String, List<ReviewDecision>> decisions) {
        SeniorReviewPort.ItemState s = states.get(itemKey(p));
        return ApprovalRule.displayStatus(decisions.getOrDefault(itemKey(p), List.of()), s == null ? null : s.extractedAt(),
            s == null ? null : s.review());
    }

    Mono<List<PairView>> views(Universe u, List<PairQueue.Entry> page) {
        if (page.isEmpty()) return Mono.just(List.of());
        List<String> as = new ArrayList<>(page.size()), bs = new ArrayList<>(page.size());
        Set<String> codes = new HashSet<>(), items = new HashSet<>();
        Map<String, Sides> sides = new HashMap<>();
        Map<String, List<Product>> sorted = new HashMap<>();
        for (PairQueue.Entry e : page) {
            as.add(e.ddinterA()); bs.add(e.ddinterB()); codes.add(e.ddinterA()); codes.add(e.ddinterB());
            Sides s = sides(u, e, sorted);
            sides.put(e.key(), s);
            s.a().stream().limit(BRANDS_SHOWN).forEach(p -> items.add(itemKey(p)));
            s.b().stream().limit(BRANDS_SHOWN).forEach(p -> items.add(itemKey(p)));
        }
        return Mono.zip(port.pairDetails(as, bs), port.entries(codes), port.itemStates(items), port.decisions(items)).map(t -> {
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
                    displayStatus(p, t.getT3(), t.getT4()), "a")));
                s.b().stream().limit(BRANDS_SHOWN).forEach(p -> brands.add(new SeniorViews.Brand(p.conceptId(), p.tradeName(), p.batchId(),
                    displayStatus(p, t.getT3(), t.getT4()), "b")));
                Set<String> batches = new HashSet<>();
                s.a().forEach(p -> batches.add(p.batchId()));
                s.b().forEach(p -> batches.add(p.batchId()));
                out.add(new PairView(e.ddinterA(), e.ddinterB(), new SeniorViews.Side(e.bdsA(), e.nameA()),
                    new SeniorViews.Side(e.bdsB(), e.nameB()), entryRef(u, t.getT2(), e.ddinterA(), e.bdsA(), row.nameA()),
                    entryRef(u, t.getT2(), e.ddinterB(), e.bdsB(), row.nameB()), row.severity(), row.actions(), content.interaction(),
                    content.management(), SourceLinks.pair(row.interactionId()).orElse(null), e.applies(), List.copyOf(brands),
                    new SeniorViews.BrandCounts(s.a().size(), s.b().size(), batches.size()), PairReviewRule.review(ds, hash),
                    PairReviewRule.changes(ds, content, hash), PairReviewRule.history(ds, hash),
                    new SeniorViews.PairVersion(hash, PairReviewRule.lastId(ds))));
            }
            return List.copyOf(out);
        });
    }

    /** The entry's route scope is that of the mapping to the side's (labelled) substance. */
    private static SeniorViews.EntryRef entryRef(Universe u, Map<String, SeniorReviewPort.EntryInfo> entries, String id, String bdsId,
                                                 String partnerName) {
        SeniorReviewPort.EntryInfo info = entries.get(id);
        DdinterCode code = u.codeInfo().getOrDefault(id, Map.of()).get(bdsId);
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
                // Brands and batches per held substance, in one pass over the held products.
                Map<String, Integer> brands = new HashMap<>();
                Map<String, Set<String>> batches = new HashMap<>();
                for (Product p : u.products())
                    for (BatchPairs.Substance s : p.substances()) {
                        brands.merge(s.bdsId(), 1, Integer::sum);
                        batches.computeIfAbsent(s.bdsId(), k -> new HashSet<>()).add(p.batchId());
                    }
                // One pass over the queue: a to-do pair counts once for every held substance either entry is mapped to.
                Map<String, int[]> todo = new HashMap<>();
                for (PairQueue.Entry e : u.entries()) {
                    if (!PairQueue.inShow("todo", e.state())) continue;
                    Set<String> of = new HashSet<>(u.bdsOfCode().getOrDefault(e.ddinterA(), Set.of()));
                    of.addAll(u.bdsOfCode().getOrDefault(e.ddinterB(), Set.of()));
                    boolean major = "major".equals(e.severity());
                    for (String b : of) {
                        int[] n = todo.computeIfAbsent(b, k -> new int[2]);
                        n[0]++;
                        if (major) n[1]++;
                    }
                }
                List<SeniorViews.SubstanceRow> rows = new ArrayList<>();
                for (Map.Entry<String, Integer> c : brands.entrySet()) {
                    String bds = c.getKey(), name = u.substanceNames().getOrDefault(bds, bds);
                    if (!needle.isEmpty() && !name.toLowerCase(Locale.ROOT).contains(needle) && !bds.toLowerCase(Locale.ROOT).contains(needle)) continue;
                    int[] n = todo.getOrDefault(bds, new int[2]);
                    rows.add(new SeniorViews.SubstanceRow(bds, name, c.getValue(), batches.get(bds).size(), n[0], n[1]));
                }
                rows.sort(Comparator.comparingInt(SeniorViews.SubstanceRow::pairsToReview).reversed()
                    .thenComparing(r -> r.name().toLowerCase(Locale.ROOT)).thenComparing(SeniorViews.SubstanceRow::bdsId));
                return new SeniorViews.SubstancesPage(rows.size(), ((Paging) v[1]).slice(rows));
            }));
    }

    /** The held products carrying one substance, in BRAND_ORDER. */
    private static List<Product> carrying(Universe u, String bdsId) {
        List<Product> out = new ArrayList<>();
        for (Product p : u.products())
            for (BatchPairs.Substance s : p.substances()) if (bdsId.equals(s.bdsId())) { out.add(p); break; }
        out.sort(BRAND_ORDER);
        return out;
    }

    // ---- GET /v1/review/substances/{bdsId}

    public Mono<SeniorViews.SubstanceDetail> substance(String bdsId, String scope, String severity, String page, String size,
                                                       String viewerEmail) {
        return Mono.fromCallable(() -> new Object[]{oneOf(scope, "all", PairQueue.SCOPES, "pairs"),
                oneOf(severity, null, PairQueue.SEVERITIES, "severity"), paging(page, size)})
            .flatMap(v -> universe(viewerEmail).flatMap(u -> {
                List<Product> sorted = carrying(u, bdsId);
                if (sorted.isEmpty()) return Mono.error(new NotFoundException("bdsId", "No substance with this id is held"));
                List<PairQueue.Entry> selected = PairQueue.select(u.entries().stream()
                    .filter(e -> involves(u, bdsId, e)).toList(), "all", (String) v[0], (String) v[1]);
                Set<String> bdc = new HashSet<>();
                sorted.forEach(p -> { if (p.bdcId() != null) bdc.add(p.bdcId()); });
                List<String> keys = sorted.stream().map(SeniorReviewService::itemKey).toList();
                return Mono.zip(port.substance(bdsId), port.strengths(bdc, bdsId), port.itemStates(keys), port.decisions(keys),
                        views(u, ((Paging) v[2]).slice(selected)))
                    .map(t -> new SeniorViews.SubstanceDetail(bdsId, t.getT1().name(), t.getT1().names(), t.getT1().codes(),
                        t.getT1().coverage(), t.getT1().entries(),
                        sorted.stream().map(p -> brandRow(p, bdsId, t.getT2(), t.getT3(), t.getT4())).toList(),
                        new SeniorViews.PairList(selected.size(), t.getT5())));
            }));
    }

    private static SeniorViews.BrandRow brandRow(Product p, String bdsId, Map<String, String> strengths,
                                                 Map<String, SeniorReviewPort.ItemState> states,
                                                 Map<String, List<ReviewDecision>> decisions) {
        BatchPairs.Substance s = p.substances().stream().filter(x -> bdsId.equals(x.bdsId())).findFirst().orElseThrow();
        Optional<RouteRule.Choice> choice = RouteRule.choose(s.codes(), p.route());
        List<SeniorViews.Chosen> chosen = choice.map(c -> c.codes().stream()
            .map(x -> new SeniorViews.Chosen(x.code(), x.routeScope(), c.routeAssumed())).toList()).orElse(List.of());
        String reason = "none".equals(s.coverage()) ? "no_data" : !"full".equals(s.coverage()) ? "not_run" : chosen.isEmpty() ? "no_route" : null;
        return new SeniorViews.BrandRow(p.conceptId(), p.tradeName(), p.batchId(), displayStatus(p, states, decisions),
            p.bdcId() == null ? null : new SeniorViews.Clinical(p.bdcId(), p.clinicalName(), p.route()),
            p.bdcId() == null ? "" : strengths.getOrDefault(p.bdcId(), ""), reason == null ? chosen : List.of(), reason);
    }

    // ---- pair decisions (§7.7)

    private static final Logger log = LoggerFactory.getLogger(SeniorReviewService.class);
    public static final Set<String> PAIR_DECISIONS = Set.of("reviewed", "issue");
    private static final Pattern HASH = Pattern.compile("^[0-9a-f]{64}$");
    private static final Pattern UUID_TEXT =
        Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern DDINTER_ID = Pattern.compile("^DDInter[0-9]{1,6}$");

    /** {@code lastIdSent} is false when the key was left out; the id arrives as text (digits, null, or anything else). */
    public record PairRequest(String decision, String note, String reviewerEmail, String reviewerRole, String expectedContentHash,
                              boolean lastIdSent, String expectedLastPairReviewId, String requestId) {}

    public Mono<SeniorViews.PairOutcome> decide(String a, String b, PairRequest r) {
        return Mono.fromCallable(() -> validate(r))
            .flatMap(d -> port.decide(a, b, d))
            .onErrorResume(e -> e instanceof InvalidQueryException || e instanceof ConflictException,
                e -> port.recordRejection(rejection(a, b, r, e))
                    .onErrorResume(x -> {
                        log.error("pair_decision_rejected audit row not written: {}", x.getClass().getName());
                        return Mono.empty();
                    })
                    .then(Mono.<SeniorViews.PairOutcome>error(e)));
    }

    static SeniorReviewPort.NewPairDecision validate(PairRequest r) {
        if (!"senior".equals(r.reviewerRole()))
            throw new InvalidQueryException("reviewerRole", "Only a senior pharmacist can review pairs");
        String decision = Validate.oneOf(r.decision(), PAIR_DECISIONS, "decision");
        String note = Validate.text(r.note(), "issue".equals(decision) ? 5 : 0, 1000, "note");
        String email = Validate.email(r.reviewerEmail(), "reviewerEmail");
        if (r.requestId() == null || !UUID_TEXT.matcher(r.requestId()).matches())
            throw new InvalidQueryException("requestId", "requestId must be a UUID, reused unchanged on every retry");
        if (r.expectedContentHash() == null || !HASH.matcher(r.expectedContentHash()).matches())
            throw new InvalidQueryException("expectedContentHash", "expectedContentHash must be 64 lower-case hex characters");
        if (!r.lastIdSent())
            throw new InvalidQueryException("expectedLastPairReviewId",
                "expectedLastPairReviewId is required: send the pair's lastPairReviewId as the page showed it (null when none)");
        Long last = null;
        if (r.expectedLastPairReviewId() != null) {
            try {
                last = Long.parseLong(r.expectedLastPairReviewId());
                if (last < 1) throw new NumberFormatException();
            } catch (NumberFormatException e) {
                throw new InvalidQueryException("expectedLastPairReviewId", "expectedLastPairReviewId must be a positive integer or null");
            }
        }
        return new SeniorReviewPort.NewPairDecision(decision, note, email, r.expectedContentHash(), last, UUID.fromString(r.requestId()));
    }

    static SeniorReviewPort.PairRejection rejection(String a, String b, PairRequest r, Throwable e) {
        String email = Validate.stripped(r.reviewerEmail());
        boolean ids = a != null && b != null && DDINTER_ID.matcher(a).matches() && DDINTER_ID.matcher(b).matches();
        UUID rid = r.requestId() != null && UUID_TEXT.matcher(r.requestId()).matches() ? UUID.fromString(r.requestId()) : null;
        return new SeniorReviewPort.PairRejection(ids ? a : null, ids ? b : null, Validate.isEmail(email) ? email : null,
            "senior".equals(r.reviewerRole()) ? "senior" : null, e instanceof ConflictException ? "CONFLICT" : "INVALID_QUERY", rid);
    }
}
