package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.Batch;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import java.util.List;

@RestController
@RequestMapping("/v1/batches")
public class BatchController {
    private final BatchQueryPort batches;
    public BatchController(BatchQueryPort batches) { this.batches = batches; }

    @GetMapping
    public Mono<ApiResponse<List<Batch>>> list() { return batches.list().collectList().map(ApiResponse::ok); }

    @GetMapping("/{batchId}")
    public Mono<ApiResponse<Batch>> get(@PathVariable String batchId) {
        return batches.find(batchId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
    }
}
