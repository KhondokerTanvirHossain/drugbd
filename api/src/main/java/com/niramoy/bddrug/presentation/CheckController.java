package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.InteractionCheckService;
import com.niramoy.bddrug.domain.CheckResult;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import java.util.List;

@RestController
@RequestMapping("/v1/interactions")
public class CheckController {
    private final InteractionCheckService service;
    private final InternalAuth auth;
    public CheckController(InteractionCheckService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    public record CheckRequest(List<String> conceptIds) {}

    /** Under public scope (default) unapproved products go to notReviewed and take no part in the check. */
    @PostMapping("/check")
    public Mono<ApiResponse<CheckResult>> check(@RequestBody CheckRequest body, @RequestParam(required = false) String scope,
                                                @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.check(body.conceptIds(), auth.scope(scope, token)).map(ApiResponse::ok);
    }
}
