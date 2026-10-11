package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;
public record Batch(String batchId, String status, Instant runAt, int itemCount, List<BatchItem> items) {
    public Batch withItems(List<BatchItem> list) { return new Batch(batchId, status, runAt, itemCount, list); }
}
