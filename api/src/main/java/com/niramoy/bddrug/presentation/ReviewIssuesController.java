package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ReviewQueryService;
import com.niramoy.bddrug.domain.ReviewViews.IssuesPage;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

/** §7.3 (D76): records with an issue reported, across every batch. Notes are reviewer text, so the internal token is required. */
@RestController
@RequestMapping("/v1/review/issues")
public class ReviewIssuesController {
    private final ReviewQueryService service;
    private final InternalAuth auth;
    public ReviewIssuesController(ReviewQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<IssuesPage>> issues(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                                @RequestParam(required = false) String page) {
        auth.require(token);
        return service.issues(page).map(ApiResponse::ok);
    }
}
