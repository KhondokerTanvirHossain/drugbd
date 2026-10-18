package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.QaQueryService;
import com.niramoy.bddrug.domain.QaViews;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/**
 * QA reads (spec §7.9.5): unreviewed data from every batch, for the web's key-gated QA API only, so every endpoint needs the
 * internal token. Read-only. Every query parameter is passed to the service, which refuses one it does not take.
 */
@RestController
@RequestMapping("/v1/qa")
public class QaQueryController {
    protected final QaQueryService service;
    protected final InternalAuth auth;
    public QaQueryController(QaQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping("/batches/{batchId}/items")
    public Mono<ApiResponse<QaViews.BatchItems>> batchItems(@PathVariable String batchId,
            @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestParam MultiValueMap<String, String> query) {
        auth.require(token);
        return service.batchItems(batchId, query).map(ApiResponse::ok);
    }

    @GetMapping("/records")
    public Mono<ApiResponse<QaViews.Records>> records(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestParam MultiValueMap<String, String> query) {
        auth.require(token);
        return service.records(query).map(ApiResponse::ok);
    }
}
