package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.QaQueryPort;
import com.niramoy.bddrug.application.port.QaQueryPort.Filter;
import com.niramoy.bddrug.application.port.QaQueryPort.Item;
import com.niramoy.bddrug.application.port.QaQueryPort.Key;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.QaViews;
import com.niramoy.bddrug.domain.ReviewDecision;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The QA read endpoints (spec §7.9.5): one batch's current items with their stage results, and the current items of every
 * batch that match a problem filter (§7.9.4). Inputs follow §7.9.2 (400 INVALID_QUERY with the field); a query parameter
 * an endpoint does not take, or a repeated one, is refused by name. displayStatus is ApprovalRule.displayStatus. A constant
 * number of queries per request, never one per item.
 */
@Service
public class QaQueryService {
    public static final int RECORDS_SIZE = 100, PAGE_MAX = 999;
    public static final List<String> FILTERS =
        List.of("strength_missing", "parse_partial", "route_assumed", "no_ddinter_data", "unaligned", "stage_warn", "stage_fail");
    public static final List<String> STAGES = List.of("dgda", "substances", "clinical", "ddinter");
    public static final String STAGE_WARN = "stage_warn";
    /** The load-dgda.yml batch-name character set: a batch id is the batch file's stem (§7.9.2). */
    static final Pattern BATCH_ID = Pattern.compile("[A-Za-z0-9._-]{1,100}");
    static final Pattern PAGE = Pattern.compile("[0-9]{1,3}");
    static final Set<String> RECORD_PARAMS = Set.of("filter", "stage", "batch", "page");

    protected final QaQueryPort port;
    public QaQueryService(QaQueryPort port) { this.port = port; }

    /**
     * Refuses a parameter the endpoint does not take and a repeated one, naming it (§7.9.2). Parameters are checked in the
     * order the request sent them.
     */
    static void onlyOnce(Map<String, List<String>> query, Set<String> allowed) {
        for (Map.Entry<String, List<String>> e : query.entrySet()) {
            if (!allowed.contains(e.getKey())) throw new InvalidQueryException(field(e.getKey()), "Unknown query parameter");
            if (e.getValue().size() != 1) throw new InvalidQueryException(e.getKey(), e.getKey() + " may be sent once");
        }
    }

    /** A refused parameter's name is echoed as the field, capped so an error stays small. */
    private static String field(String name) {
        return name.length() <= 100 ? name : name.substring(0, 100);
    }

    static String batchId(String value, String field) {
        if (value == null || !BATCH_ID.matcher(value).matches())
            throw new InvalidQueryException(field, field + " must be 1-100 letters, digits, '.', '_' or '-'");
        return value;
    }

    private static String one(Map<String, List<String>> query, String name) {
        List<String> v = query.get(name);
        return v == null || v.isEmpty() ? null : v.get(0);
    }

    // ---- GET /v1/qa/batches/{b}/items

    public Mono<QaViews.BatchItems> batchItems(String batchId, Map<String, List<String>> query) {
        return Mono.fromCallable(() -> {
                onlyOnce(query, Set.of());
                return batchId(batchId, "batchId");
            })
            .flatMap(b -> port.batch(b).switchIfEmpty(Mono.error(() -> new NotFoundException("batchId", "Batch not found"))))
            .flatMap(batch -> Mono.zip(port.batchItems(batch.batchId()), port.batchDecisions(batch.batchId())).map(t -> {
                List<QaViews.BatchItem> items = t.getT1().stream().map(i -> new QaViews.BatchItem(i.conceptId(), i.tradeName(),
                        status(i, t.getT2().getOrDefault(i.conceptId(), List.of())),
                        i.stages().stream().map(s -> new QaViews.Stage(s.stage(), s.status(), s.note())).toList()))
                    .toList();
                return new QaViews.BatchItems(batch.batchId(), batch.status(), batch.runAt(), items.size(), items);
            }));
    }

    private static String status(Item i, List<ReviewDecision> decisions) {
        return ApprovalRule.displayStatus(decisions, i.extractedAt(), i.review());
    }

    // ---- GET /v1/qa/records

    record RecordQuery(Filter filter, int page) {}

    static RecordQuery recordQuery(Map<String, List<String>> query) {
        onlyOnce(query, RECORD_PARAMS);
        String filter = one(query, "filter");
        if (filter == null || !FILTERS.contains(filter))
            throw new InvalidQueryException("filter", "filter must be one of " + String.join(", ", FILTERS));
        // containsKey, not a null value: "?stage" with no "=" is sent, and refused like any other bad value
        String stage = one(query, "stage");
        if (query.containsKey("stage")) {
            if (!STAGE_WARN.equals(filter)) throw new InvalidQueryException("stage", "stage is allowed only with filter=stage_warn");
            if (stage == null || !STAGES.contains(stage))
                throw new InvalidQueryException("stage", "stage must be one of " + String.join(", ", STAGES));
        }
        String batch = query.containsKey("batch") ? batchId(one(query, "batch"), "batch") : null;
        String page = one(query, "page");
        if (query.containsKey("page") && (page == null || !PAGE.matcher(page).matches()))
            throw new InvalidQueryException("page", "page must be a whole number 0-" + PAGE_MAX);
        return new RecordQuery(new Filter(filter, stage, batch), page == null ? 0 : Integer.parseInt(page));
    }

    public Mono<QaViews.Records> records(Map<String, List<String>> query) {
        return Mono.fromCallable(() -> recordQuery(query)).flatMap(q -> {
            Filter f = q.filter();
            Mono<Boolean> known = f.batch() == null ? Mono.just(true) : port.batch(f.batch()).hasElement();
            return known.flatMap(exists -> {
                if (!exists) return Mono.error(new NotFoundException("batch", "Batch not found"));
                return Mono.zip(port.records(f, q.page() * RECORDS_SIZE, RECORDS_SIZE), port.recordCount(f))
                    .flatMap(t -> decisionsOf(t.getT1()).map(decisions -> new QaViews.Records(f.filter(), f.stage(), f.batch(),
                        q.page(), RECORDS_SIZE, t.getT2(), t.getT1().stream().map(i -> row(i,
                            decisions.getOrDefault(new Key(i.batchId(), i.conceptId()), List.of()))).toList())));
            });
        });
    }

    /** One decisions query for the page's items; none for an empty page. */
    private Mono<Map<Key, List<ReviewDecision>>> decisionsOf(List<Item> page) {
        if (page.isEmpty()) return Mono.just(Map.of());
        return port.decisions(page.stream().map(i -> new Key(i.batchId(), i.conceptId())).toList());
    }

    private static QaViews.RecordRow row(Item i, List<ReviewDecision> decisions) {
        Map<String, String> s = new HashMap<>();
        for (QaQueryPort.StageRow r : i.stages()) s.put(r.stage(), r.status());
        return new QaViews.RecordRow(i.batchId(), i.conceptId(), i.tradeName(), status(i, decisions),
            new QaViews.StageStatuses(s.get("dgda"), s.get("substances"), s.get("clinical"), s.get("ddinter")));
    }
}
