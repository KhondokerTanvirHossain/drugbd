package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.FlagService;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagPage;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** Problem reports and partner requests. Every endpoint needs the internal token: flags carry reporter emails. */
@RestController
@RequestMapping("/v1/flags")
public class FlagController {
    private final FlagService service;
    private final InternalAuth auth;
    public FlagController(FlagService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    public record ResolveRequest(String resolvedBy, String requestId) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ApiResponse<Flag>> create(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                          @RequestBody Mono<FlagService.Request> body) {
        auth.require(token);
        return body.flatMap(service::create).map(ApiResponse::ok);
    }

    @GetMapping
    public Mono<ApiResponse<FlagPage>> list(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                            @RequestParam(required = false) String status,
                                            @RequestParam(required = false) String targetType,
                                            @RequestParam(required = false) String targetId,
                                            @RequestParam(required = false) String excludeTargetId,
                                            @RequestParam(required = false) String page,
                                            @RequestParam(required = false) String size) {
        auth.require(token);
        return service.list(status, targetType, targetId, excludeTargetId, page, size).map(ApiResponse::ok);
    }

    @PostMapping("/{id}/resolve")
    public Mono<ApiResponse<Flag>> resolve(@PathVariable long id,
                                           @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                           @RequestBody Mono<ResolveRequest> body) {
        auth.require(token);
        return body.flatMap(r -> service.resolve(id, r.resolvedBy(), r.requestId())).map(ApiResponse::ok);
    }
}
