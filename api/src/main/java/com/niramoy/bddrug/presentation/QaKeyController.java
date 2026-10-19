package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.QaKeyService;
import com.niramoy.bddrug.domain.QaKeys;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/**
 * Self-service QA keys (spec §7.10.3), for the web server only: every endpoint needs the internal token. The web generates
 * each key and sends only its SHA-256 hash; no endpoint here receives or returns a key, and only verify returns an email (the
 * owner's, for the web's role check). Bodies and headers are never logged or echoed.
 */
@RestController
@RequestMapping("/v1/qa-keys")
public class QaKeyController {
    private final QaKeyService service;
    private final InternalAuth auth;
    public QaKeyController(QaKeyService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ApiResponse<QaKeys.Key>> create(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                                @RequestBody Mono<QaKeyService.CreateRequest> body) {
        auth.require(token);
        return body.flatMap(service::create).map(ApiResponse::ok);
    }

    @PostMapping("/{id}/revoke")
    public Mono<ApiResponse<QaKeys.Key>> revoke(@PathVariable String id,
                                                @RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                                @RequestBody Mono<QaKeyService.RevokeRequest> body) {
        auth.require(token);
        return body.flatMap(r -> service.revoke(id, r)).map(ApiResponse::ok);
    }

    @GetMapping
    public Mono<ApiResponse<QaKeys.Page>> list(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                               @RequestHeader(value = QaKeyService.VIEWER_HEADER, required = false) String viewer) {
        auth.require(token);
        return service.list(viewer).map(ApiResponse::ok);
    }

    @PostMapping("/verify")
    public Mono<ApiResponse<QaKeys.Verified>> verify(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                                     @RequestBody Mono<QaKeyService.VerifyRequest> body) {
        auth.require(token);
        return body.flatMap(service::verify).map(ApiResponse::ok);
    }

    @PostMapping("/{id}/used")
    public Mono<ResponseEntity<Void>> used(@PathVariable String id,
                                           @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.require(token);
        return service.touch(id).then(Mono.just(ResponseEntity.noContent().build()));
    }
}
