package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ReviewQueryService;
import com.niramoy.bddrug.domain.ReviewViews.BatchSummary;
import com.niramoy.bddrug.domain.ReviewViews.ItemsPage;
import com.niramoy.bddrug.domain.ReviewViews.VersionRow;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import java.util.List;

/** Reviewer reads (spec §7.3): unreviewed data, so every endpoint needs the internal token. */
@RestController
@RequestMapping("/v1/review/batches")
public class ReviewQueryController {
    protected final ReviewQueryService service;
    protected final InternalAuth auth;
    public ReviewQueryController(ReviewQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<List<BatchSummary>>> batches(@RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.batches().collectList().map(ApiResponse::ok);
    }

    @GetMapping("/{batchId}/items")
    public Mono<ApiResponse<ItemsPage>> items(@PathVariable String batchId,
                                              @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                              @RequestParam(required = false) String show, @RequestParam(required = false) String q,
                                              @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        auth.require(token);
        return service.items(batchId, show, q, page, size).map(ApiResponse::ok);
    }

    @GetMapping("/{batchId}/versions")
    public Mono<ApiResponse<List<VersionRow>>> versions(@PathVariable String batchId,
                                                        @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.versions(batchId).map(ApiResponse::ok);
    }
}
