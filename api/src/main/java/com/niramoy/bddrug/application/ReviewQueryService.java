package com.niramoy.bddrug.application;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.application.port.ReviewQueryPort;
import com.niramoy.bddrug.application.port.ReviewQueryPort.ItemFacts;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.BatchPairs;
import com.niramoy.bddrug.domain.DdinterCode;
import com.niramoy.bddrug.domain.ItemHistory;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.ReviewItem;
import com.niramoy.bddrug.domain.ReviewTriage;
import com.niramoy.bddrug.domain.ReviewViews;
import com.niramoy.bddrug.domain.RouteRule;
import com.niramoy.bddrug.domain.SnapshotDiff;
import com.niramoy.bddrug.domain.StageNotes;
import com.niramoy.bddrug.domain.ReviewViews.BatchSummary;
import com.niramoy.bddrug.domain.ReviewViews.Counts;
import com.niramoy.bddrug.domain.ReviewViews.ItemRow;
import com.niramoy.bddrug.domain.ReviewViews.ItemsPage;
import com.niramoy.bddrug.domain.ReviewViews.Version;
import com.niramoy.bddrug.domain.ReviewViews.VersionRow;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** The reviewer read endpoints (spec §7.3). displayStatus is computed once per item with one decisions query per batch. */
@Service
public class ReviewQueryService {
    public static final int Q_MAX = 100, SIZE_MAX = 500, SIZE_DEFAULT = 100, PAGE_MAX = 10_000;
    private static final Pattern DIGITS = Pattern.compile("^[0-9]{1,6}$");

    protected final ReviewQueryPort port;
    protected final ObjectMapper json;
    public ReviewQueryService(ReviewQueryPort port, ObjectMapper json) {
        this.port = port;
        this.json = json;
    }

    /** One item with everything the lists derive from it. {@code index} is 1-based over the batch's current items. */
    record Assessed(int index, ItemFacts facts, String displayStatus, ReviewTriage.Facts triage, Version version) {}

    List<Assessed> assess(List<ItemFacts> items) {
        List<Assessed> out = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            ItemFacts f = items.get(i);
            String status = ApprovalRule.displayStatus(f.decisions(), f.extractedAt(), f.review());
            Map<String, String> stages = new LinkedHashMap<>();
            int pairs = 0;
            for (ReviewQueryPort.StageRow s : f.stages()) {
                stages.put(s.stage(), s.status());
                if ("ddinter".equals(s.stage())) pairs = textMissing(s.evidence()).size();
            }
            List<String> coverages = f.ingredients().stream().filter(g -> g.bdsId() != null).map(ReviewQueryPort.IngredientFact::coverage).toList();
            Long last = f.decisions().stream().map(ReviewDecision::id).max(Long::compare).orElse(null);
            out.add(new Assessed(i + 1, f, status, new ReviewTriage.Facts(status, stages, pairs, coverages), new Version(f.extractedAt(), last)));
        }
        return out;
    }

    /** {@code evidence.text_missing} as [[a, b], …]; empty when absent or unreadable. */
    List<String[]> textMissing(String evidence) {
        List<String[]> out = new ArrayList<>();
        if (evidence == null) return out;
        try {
            for (JsonNode pair : json.readTree(evidence).path("text_missing"))
                if (pair.size() == 2) out.add(new String[]{pair.get(0).asText(), pair.get(1).asText()});
        } catch (Exception e) {
            return out;
        }
        return out;
    }

    Mono<ReviewQueryPort.BatchRow> requireBatch(String batchId) {
        return port.batch(batchId).switchIfEmpty(Mono.error(() -> new NotFoundException("batchId", "Batch not found")));
    }

    public Flux<BatchSummary> batches() {
        return port.batches().concatMap(b -> port.items(b.batchId()).map(items -> {
            List<Assessed> all = assess(items);
            int approved = 0, issue = 0, needs = 0, engineer = 0, back = 0, noData = 0, warnings = 0;
            for (Assessed a : all) {
                switch (a.displayStatus()) {
                    case ApprovalRule.APPROVED -> approved++;
                    case ApprovalRule.ISSUE -> issue++;
                    case ApprovalRule.ENGINEER_CHECKED -> engineer++;
                    case ApprovalRule.BACK_IN_REVIEW -> back++;
                    default -> { }
                }
                if (ReviewTriage.needsReview(a.displayStatus())) needs++;
                if (ReviewTriage.inFilter("nodata", a.triage())) noData++;
                if (ReviewTriage.inFilter("warn", a.triage())) warnings++;
            }
            return new BatchSummary(b.batchId(), b.status(), b.runAt(), all.size(),
                new Counts(approved, issue, needs, engineer, back, noData, warnings));
        }));
    }

    public Mono<ItemsPage> items(String batchId, String show, String q, String page, String size) {
        return Mono.fromCallable(() -> new Object[]{
                Validate.oneOf(show == null ? "all" : show, java.util.Set.copyOf(ReviewTriage.SHOWS), "show"),
                query(q), number(page, 0, 0, PAGE_MAX, "page"), number(size, SIZE_DEFAULT, 1, SIZE_MAX, "size")})
            .flatMap(v -> requireBatch(batchId).then(port.items(batchId)).map(items -> {
                List<Assessed> all = assess(items);
                String filter = (String) v[0], needle = (String) v[1];
                int p = (Integer) v[2], n = (Integer) v[3];
                List<ItemRow> rows = all.stream()
                    .filter(a -> ReviewTriage.inFilter(filter, a.triage()))
                    .filter(a -> needle.isEmpty() || haystack(a.facts()).contains(needle))
                    .skip((long) p * n).limit(n)
                    .map(ReviewQueryService::row).toList();
                return new ItemsPage(batchId, all.size(), ReviewTriage.filterCounts(all.stream().map(Assessed::triage).toList()), rows);
            }));
    }

    public Mono<List<VersionRow>> versions(String batchId) {
        return requireBatch(batchId).then(port.items(batchId)).map(items -> assess(items).stream()
            .map(a -> new VersionRow(a.facts().conceptId(), a.version().extractedAt(), a.version().lastDecisionId(), a.displayStatus()))
            .toList());
    }

    static ItemRow row(Assessed a) {
        return new ItemRow(a.index(), a.facts().conceptId(), a.facts().tradeName(), a.facts().clinicalDisplayName(),
            a.displayStatus(), ReviewTriage.hint(a.triage()), a.version());
    }

    /** Everything the record filter matches, lower-cased; a literal substring test, never a pattern (Review Focus 5). */
    static String haystack(ItemFacts f) {
        List<String> parts = new ArrayList<>(List.of(nz(f.tradeName()), nz(f.clinicalDisplayName()), nz(f.genericContentRaw()),
            nz(f.darNumber()), nz(f.company())));
        for (ReviewQueryPort.IngredientFact g : f.ingredients()) {
            parts.add(nz(g.name()));
            parts.add(nz(g.dgdaName()));
            parts.add(nz(g.bdsId()));
        }
        return String.join("\n", parts).toLowerCase(Locale.ROOT);
    }

    private static String nz(String s) { return s == null ? "" : s; }

    private static String query(String q) {
        String s = q == null ? "" : q.strip();
        if (Validate.length(s) > Q_MAX) throw new InvalidQueryException("q", "q must be at most " + Q_MAX + " characters");
        return s.toLowerCase(Locale.ROOT);
    }

    static int number(String value, int fallback, int min, int max, String field) {
        if (value == null) return fallback;
        if (!DIGITS.matcher(value).matches()) throw new InvalidQueryException(field, field + " must be a whole number");
        int n = Integer.parseInt(value);
        if (n < min || n > max) throw new InvalidQueryException(field, field + " must be " + min + "-" + max);
        return n;
    }

    public static final String OCL_CONCEPT = "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/";
    private static final List<String> STAGES = List.of("dgda", "substances", "clinical", "ddinter");

    /**
     * The OCL concept URL, as web/lib/evidence.ts builds it with encodeURIComponent. URLEncoder escapes five characters
     * that encodeURIComponent keeps (! ' ( ) ~) and writes a space as "+", so both are undone here.
     */
    public static String sourceUrl(String conceptId) {
        String encoded = URLEncoder.encode(conceptId, StandardCharsets.UTF_8).replace("+", "%20")
            .replace("%21", "!").replace("%27", "'").replace("%28", "(").replace("%29", ")").replace("%7E", "~");
        return OCL_CONCEPT + encoded + "/";
    }

    private static Assessed find(List<Assessed> all, String conceptId) {
        return all.stream().filter(a -> a.facts().conceptId().equals(conceptId)).findFirst()
            .orElseThrow(() -> new NotFoundException("conceptId", "Batch item not found"));
    }

    public Mono<ReviewItem> item(String batchId, String conceptId, String viewerEmail) {
        return requireBatch(batchId).flatMap(batch -> port.items(batchId).flatMap(items -> {
            List<Assessed> all = assess(items);
            Assessed me = find(all, conceptId);
            return port.itemDetail(batchId, conceptId)
                .switchIfEmpty(Mono.error(() -> new NotFoundException("conceptId", "Batch item not found")))
                .flatMap(d -> {
                    String route = d.clinical() == null ? null : d.clinical().route();
                    return Mono.zip(port.ingredients(conceptId, d.bdcId(), route), pairs(batchId, conceptId), port.snapshots(batchId, conceptId),
                            port.fullRuns(batchId))
                        .flatMap(t -> stages(me, t.getT2().products(), conceptId).map(stages -> {
                            List<Instant> runs = t.getT4().isEmpty() ? List.of(batch.runAt()) : t.getT4();
                            List<ItemHistory.Decision> decisions = me.facts().decisions().stream().map(x -> new ItemHistory.Decision(
                                x.id(), x.decision(), x.note(), x.reviewerRole(), x.decidedAt(),
                                viewerEmail != null && x.reviewerEmail() != null && x.reviewerEmail().equalsIgnoreCase(viewerEmail.strip()))).toList();
                            ItemHistory.Result history = ItemHistory.build(runs, t.getT3(), decisions, me.facts().extractedAt());
                            return new ReviewItem(batchId, conceptId, me.index(), all.size(), me.displayStatus(), me.facts().review(),
                                me.version(), new ReviewItem.BatchInfo(batch.runAt(), all.size(), batch.status()), d.brand(),
                                d.dgdaIngredients(), d.clinical(), t.getT1(), stages, t.getT2().result(), d.sourceJson(),
                                sourceUrl(conceptId), history.history(), history.reopen());
                        }));
                });
        }));
    }

    /** The batch products and the pair result for the open record (RouteRule on both sides, §5.6.2). */
    private record PairsAndProducts(List<BatchPairs.Product> products, BatchPairs.Result result) {}

    private Mono<PairsAndProducts> pairs(String batchId, String conceptId) {
        return port.batchProducts(batchId).flatMap(products -> {
            Set<String> ids = new HashSet<>();
            for (BatchPairs.Product p : products)
                for (BatchPairs.Substance s : p.substances()) for (DdinterCode c : s.codes()) ids.add(c.code());
            return Mono.zip(port.pairRows(ids), port.entryNames(ids))
                .map(t -> new PairsAndProducts(products, BatchPairs.compute(conceptId, products, t.getT1(), t.getT2().keySet())));
        });
    }

    /** The ids each product checks with (RouteRule on its own route). */
    private static Set<String> chosen(BatchPairs.Product p) {
        Set<String> out = new HashSet<>();
        for (BatchPairs.Substance s : p.substances())
            RouteRule.choose(s.codes(), p.route()).ifPresent(c -> c.codes().forEach(x -> out.add(x.code())));
        return out;
    }

    /** Stage results with structured notes and enriched text-missing pairs (§7.3), in stage order. */
    private Mono<List<ReviewItem.Stage>> stages(Assessed me, List<BatchPairs.Product> products, String conceptId) {
        List<String[]> missing = new ArrayList<>();
        for (ReviewQueryPort.StageRow s : me.facts().stages()) if ("ddinter".equals(s.stage())) missing.addAll(textMissing(s.evidence()));
        Set<String> ids = new HashSet<>();
        for (String[] m : missing) { ids.add(m[0]); ids.add(m[1]); }
        Set<String> mine = new HashSet<>(), others = new HashSet<>();
        for (BatchPairs.Product p : products) (p.conceptId().equals(conceptId) ? mine : others).addAll(chosen(p));
        return Mono.zip(port.entryNames(ids), port.pairRows(ids)).map(t -> {
            Map<String, BatchPairs.PairRow> rows = new HashMap<>();
            for (BatchPairs.PairRow r : t.getT2()) rows.put(r.ddinterA() + "|" + r.ddinterB(), r);
            List<ReviewItem.Stage> out = new ArrayList<>();
            for (String stage : STAGES)
                for (ReviewQueryPort.StageRow s : me.facts().stages()) {
                    if (!stage.equals(s.stage())) continue;
                    List<ReviewItem.TextMissingPair> pairs = new ArrayList<>();
                    if ("ddinter".equals(stage))
                        for (String[] m : textMissing(s.evidence())) {
                            BatchPairs.PairRow row = rows.get(m[0] + "|" + m[1]);
                            String other = mine.contains(m[0]) ? m[1] : m[0];
                            pairs.add(new ReviewItem.TextMissingPair(m[0], name(t.getT1(), row, m[0], true), m[1],
                                name(t.getT1(), row, m[1], false), row == null ? null : row.severity(), others.contains(other)));
                        }
                    out.add(new ReviewItem.Stage(s.stage(), s.status(), StageNotes.parse(s.stage(), s.status(), s.note()),
                        List.copyOf(pairs), s.evidence()));
                }
            return List.copyOf(out);
        });
    }

    /** DDInter's own name for an entry, else the stored pair's partner name, else the id. */
    private static String name(Map<String, String> names, BatchPairs.PairRow row, String id, boolean sideA) {
        if (names.get(id) != null) return names.get(id);
        if (row != null) return sideA ? row.nameA() : row.nameB();
        return id;
    }

    public Mono<ReviewViews.Diff> diff(String batchId, String conceptId, String from) {
        return Mono.fromCallable(() -> {
                if (from == null) throw new InvalidQueryException("from", "from is required: the extractedAt the page showed");
                try {
                    return Instant.parse(from);
                } catch (DateTimeParseException e) {
                    throw new InvalidQueryException("from", "from must be an ISO-8601 instant");
                }
            })
            .flatMap(fromAt -> requireBatch(batchId).then(port.items(batchId)).flatMap(items -> {
                Assessed me = find(assess(items), conceptId);
                Instant to = me.facts().extractedAt();
                Mono<String> before = port.payload(batchId, conceptId, fromAt)
                    .switchIfEmpty(Mono.error(() -> new NotFoundException("from", "No snapshot of this record at that time")));
                Mono<String> now = to == null ? Mono.error(new NotFoundException("from", "No snapshot of this record at that time"))
                    : port.payload(batchId, conceptId, to)
                        .switchIfEmpty(Mono.error(() -> new NotFoundException("from", "No snapshot of this record at that time")));
                return Mono.zip(before, now, port.snapshots(batchId, conceptId)).map(t -> {
                    ItemHistory.Reopen reopen = ItemHistory.build(List.of(), t.getT3(), List.of(), to).reopen();
                    try {
                        return new ReviewViews.Diff(fromAt, to, reopen == null ? "rerun" : reopen.reason(),
                            SnapshotDiff.diff(json.readTree(t.getT1()), json.readTree(t.getT2())));
                    } catch (Exception e) {
                        throw new IllegalStateException("ops.item_snapshot.payload is not JSON", e);
                    }
                });
            }));
    }
}
