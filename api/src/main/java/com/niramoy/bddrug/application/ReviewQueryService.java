package com.niramoy.bddrug.application;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.application.port.ReviewQueryPort;
import com.niramoy.bddrug.application.port.ReviewQueryPort.ItemFacts;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.ReviewTriage;
import com.niramoy.bddrug.domain.ReviewViews.BatchSummary;
import com.niramoy.bddrug.domain.ReviewViews.Counts;
import com.niramoy.bddrug.domain.ReviewViews.ItemRow;
import com.niramoy.bddrug.domain.ReviewViews.ItemsPage;
import com.niramoy.bddrug.domain.ReviewViews.Version;
import com.niramoy.bddrug.domain.ReviewViews.VersionRow;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
}
