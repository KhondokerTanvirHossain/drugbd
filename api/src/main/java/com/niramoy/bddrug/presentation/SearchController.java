package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.SearchQueryService;
import com.niramoy.bddrug.domain.SearchResult;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** GET /v1/search (§7.4 P1–P4). */
@RestController
@RequestMapping("/v1/search")
public class SearchController {
    private final SearchQueryService service;
    private final InternalAuth auth;
    public SearchController(SearchQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<SearchResult>> search(@RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(required = false) String scope,
                                                  @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.search(q, page, auth.scope(scope, token)).map(ApiResponse::ok);
    }
}
