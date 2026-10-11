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
    public CheckController(InteractionCheckService service) { this.service = service; }

    public record CheckRequest(List<String> conceptIds) {}

    @PostMapping("/check")
    public Mono<ApiResponse<CheckResult>> check(@RequestBody CheckRequest body) {
        return service.check(body.conceptIds()).map(ApiResponse::ok);
    }
}
