package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.Batch;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import java.util.List;

/** Batch evidence shows unreviewed records, so it is for reviewers only: every read needs the internal token (A1). */
@RestController
@RequestMapping("/v1/batches")
public class BatchController {
    private final BatchQueryPort batches;
    private final InternalAuth auth;
    public BatchController(BatchQueryPort batches, InternalAuth auth) {
        this.batches = batches;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<List<Batch>>> list(@RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return batches.list().collectList().map(ApiResponse::ok);
    }

    @GetMapping("/{batchId}")
    public Mono<ApiResponse<Batch>> get(@PathVariable String batchId,
                                        @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return batches.find(batchId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
    }
}
