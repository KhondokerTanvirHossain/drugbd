package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.SubstanceQueryService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/v1/substances")
public class SubstanceController {
    private final SubstanceQueryService substances;
    private final InternalAuth auth;
    public SubstanceController(SubstanceQueryService substances, InternalAuth auth) {
        this.substances = substances;
        this.auth = auth;
    }

    /** Under public scope: approved products only, and the hidden shape when none of its products is approved. */
    @GetMapping("/{bdsId}")
    public Mono<ApiResponse<Object>> get(@PathVariable String bdsId, @RequestParam(required = false) String scope,
                                         @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return substances.get(bdsId, auth.scope(scope, token)).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Substance not found")));
    }
}
