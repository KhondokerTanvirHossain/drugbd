package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.BatchReport;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

/** The batch report is batch evidence: reviewers only, with the internal token (A1). It holds no emails. */
@RestController
@RequestMapping("/v1/batches")
public class BatchReportController {
    private final BatchQueryPort batches;
    private final InternalAuth auth;
    public BatchReportController(BatchQueryPort batches, InternalAuth auth) {
        this.batches = batches;
        this.auth = auth;
    }

    @GetMapping("/{batchId}/report")
    public Mono<ApiResponse<BatchReport>> report(@PathVariable String batchId,
                                                 @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return batches.report(batchId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
    }
}
