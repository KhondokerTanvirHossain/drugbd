package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ClinicalDrugQueryService;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** GET /v1/clinical-drugs/{bdcId} (§7.4 P8). Public scope by default; scope=all needs the token. */
@RestController
@RequestMapping("/v1/clinical-drugs")
public class ClinicalDrugController {
    private final ClinicalDrugQueryService service;
    private final InternalAuth auth;
    public ClinicalDrugController(ClinicalDrugQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping("/{bdcId}")
    public Mono<ApiResponse<ClinicalDrugView>> get(@PathVariable String bdcId, @RequestParam(required = false) String scope,
                                                   @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.get(bdcId, auth.scope(scope, token)).map(ApiResponse::ok);
    }
}
