package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.SubstanceQueryPort;
import com.niramoy.bddrug.domain.Substance;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/v1/substances")
public class SubstanceController {
    private final SubstanceQueryPort substances;
    public SubstanceController(SubstanceQueryPort substances) { this.substances = substances; }

    @GetMapping("/{bdsId}")
    public Mono<ApiResponse<Substance>> get(@PathVariable String bdsId) {
        return substances.find(bdsId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Substance not found")));
    }
}
