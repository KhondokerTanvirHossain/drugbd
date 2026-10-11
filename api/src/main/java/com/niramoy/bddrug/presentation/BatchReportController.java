package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.BatchReport;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

/** Batch pages are public evidence, so the report is readable without the token. It holds no emails. */
@RestController
@RequestMapping("/v1/batches")
public class BatchReportController {
    private final BatchQueryPort batches;
    public BatchReportController(BatchQueryPort batches) { this.batches = batches; }

    @GetMapping("/{batchId}/report")
    public Mono<ApiResponse<BatchReport>> report(@PathVariable String batchId) {
        return batches.report(batchId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
    }
}
