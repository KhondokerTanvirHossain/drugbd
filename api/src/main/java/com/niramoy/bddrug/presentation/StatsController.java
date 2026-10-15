package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.StatsQueryService;
import com.niramoy.bddrug.domain.SiteStats;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** GET /v1/stats (spec §7.4): public and scope-free. A token header that is present must still match. */
@RestController
@RequestMapping("/v1/stats")
public class StatsController {
    private final StatsQueryService service;
    private final InternalAuth auth;
    public StatsController(StatsQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<SiteStats>> stats(@RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.present(token);
        return service.stats().map(ApiResponse::ok);
    }
}
