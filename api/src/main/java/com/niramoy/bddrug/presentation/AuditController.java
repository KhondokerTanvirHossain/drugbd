package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** §7.5: the web server's audit writes. Token only; the body is never echoed (it holds an email). */
@RestController
@RequestMapping("/v1/audit-events")
public class AuditController {
    private final AuditService service;
    private final InternalAuth auth;
    public AuditController(AuditService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    public record Created(long id) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ApiResponse<Created>> create(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                             @RequestBody Mono<AuditService.Request> body) {
        auth.require(token);
        return body.flatMap(service::record).map(id -> ApiResponse.ok(new Created(id)));
    }
}
