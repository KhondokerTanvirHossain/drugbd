package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.SeniorReviewService;
import com.niramoy.bddrug.domain.SeniorViews;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/**
 * Senior review (spec §7.7): unreviewed data from every batch, so every endpoint needs the internal token. The web calls
 * these only for a senior session (§5.17). {@code X-Viewer-Email} marks the viewer's own pair decisions; never echoed.
 */
@RestController
@RequestMapping("/v1/review")
public class SeniorReviewController {
    protected final SeniorReviewService service;
    protected final InternalAuth auth;
    public SeniorReviewController(SeniorReviewService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping("/pairs")
    public Mono<ApiResponse<SeniorViews.PairsPage>> pairs(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestHeader(value = "X-Viewer-Email", required = false) String viewer,
            @RequestParam(required = false) String show, @RequestParam(required = false) String pairs,
            @RequestParam(required = false) String severity, @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.pairs(show, pairs, severity, page, size, viewer).map(ApiResponse::ok);
    }

    @GetMapping("/substances")
    public Mono<ApiResponse<SeniorViews.SubstancesPage>> substances(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestParam(required = false) String q, @RequestParam(required = false) String page,
            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.substances(q, page, size).map(ApiResponse::ok);
    }

    @GetMapping("/substances/{bdsId}")
    public Mono<ApiResponse<SeniorViews.SubstanceDetail>> substance(@PathVariable String bdsId,
            @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
            @RequestHeader(value = "X-Viewer-Email", required = false) String viewer,
            @RequestParam(required = false) String pairs, @RequestParam(required = false) String severity,
            @RequestParam(required = false) String page, @RequestParam(required = false) String size) {
        auth.require(token);
        return service.substance(bdsId, pairs, severity, page, size, viewer).map(ApiResponse::ok);
    }
}
