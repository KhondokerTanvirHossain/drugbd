package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.StatsQueryPort;
import com.niramoy.bddrug.application.port.StatsQueryPort.BatchRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.DecisionRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.ItemRow;
import com.niramoy.bddrug.application.port.StatsQueryPort.Totals;
import com.niramoy.bddrug.domain.ApprovalRule;
import com.niramoy.bddrug.domain.ReviewDecision;
import com.niramoy.bddrug.domain.SiteStats;
import com.niramoy.bddrug.domain.SiteStats.BatchStats;
import com.niramoy.bddrug.domain.SiteStats.ItemStats;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** GET /v1/stats (spec §7.4). The landing page (P2) and Learn (P3) read it with public scope. */
@Service
public class StatsQueryService {
    private final StatsQueryPort port;
    public StatsQueryService(StatsQueryPort port) { this.port = port; }

    public Mono<SiteStats> stats() {
        return Mono.zip(port.totals(), port.batches().collectList(), port.items().collectList(), port.decisions().collectList())
            .map(t -> assemble(t.getT1(), t.getT2(), t.getT3(), t.getT4()));
    }

    private static String key(String batchId, String conceptId) { return batchId + "\u0000" + conceptId; }

    /**
     * Pure. {@code exampleUsable} is false when the item is removed from the batch file or its display status (§5.2,
     * {@link ApprovalRule#displayStatus}) is issue; Learn withdraws such an example (§6.8).
     */
    public static SiteStats assemble(Totals totals, List<BatchRow> batches, List<ItemRow> items, List<DecisionRow> decisions) {
        Map<String, List<ReviewDecision>> byItem = new HashMap<>();
        for (DecisionRow d : decisions) byItem.computeIfAbsent(key(d.batchId(), d.conceptId()), k -> new ArrayList<>()).add(d.decision());
        Map<String, List<ItemRow>> byBatch = new LinkedHashMap<>();
        for (ItemRow i : items) byBatch.computeIfAbsent(i.batchId(), k -> new ArrayList<>()).add(i);
        List<BatchStats> out = new ArrayList<>();
        for (BatchRow b : batches) {
            List<ItemRow> rows = byBatch.getOrDefault(b.batchId(), List.of());
            List<ItemStats> listed = rows.stream().map(i -> new ItemStats(i.conceptId(), i.tradeName(),
                i.productPublic() ? SiteStats.APPROVED : SiteStats.NOT_REVIEWED,
                !i.removed() && !ApprovalRule.ISSUE.equals(ApprovalRule.displayStatus(
                    byItem.getOrDefault(key(i.batchId(), i.conceptId()), List.of()), i.extractedAt(), i.review())))).toList();
            int current = (int) rows.stream().filter(i -> !i.removed()).count();
            int approved = (int) rows.stream().filter(i -> !i.removed() && i.productPublic()).count();
            out.add(new BatchStats(b.batchId(), b.status(), current, approved, listed));
        }
        return new SiteStats(SiteStats.REGISTER_PRODUCTS, totals.productsLoaded(), totals.substances(), totals.approvedProducts(),
            totals.inReviewProducts(), List.copyOf(out));
    }
}
