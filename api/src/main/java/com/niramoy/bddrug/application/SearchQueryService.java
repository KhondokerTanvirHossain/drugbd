package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.SearchPort;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.SearchPage;
import com.niramoy.bddrug.domain.SearchResult;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** §7.4 P1–P4. The visibility rule applies to every search; scope=all only lifts the page cap (integration tests). */
@Service
public class SearchQueryService {
    public static final int PAGE_SIZE = 20, PUBLIC_PAGE_MAX = 9, ALL_PAGE_MAX = 500, MIN_LEN = 2, MAX_LEN = 100;
    private final SearchPort port;
    private final NameIndex names;
    public SearchQueryService(SearchPort port, NameIndex names) {
        this.port = port;
        this.names = names;
    }

    public Mono<SearchResult> search(String q, int page, Scope scope) {
        if (Validate.hasControl(q)) return Mono.error(new InvalidQueryException("q", "q must not contain control characters"));
        String query = q == null ? "" : q.strip();
        int len = query.codePointCount(0, query.length());
        if (len < MIN_LEN || len > MAX_LEN) return Mono.error(new InvalidQueryException("q", "q must be 2-100 characters"));
        int max = scope == Scope.PUBLIC ? PUBLIC_PAGE_MAX : ALL_PAGE_MAX;
        if (page < 0 || page > max) return Mono.error(new InvalidQueryException("page", "page must be 0-" + max));
        String term = query.toLowerCase(Locale.ROOT);
        return port.counts(term).flatMap(c -> {
            SearchPage.Plan plan = SearchPage.plan(c.substances(), c.approved(), c.stubs(), page * PAGE_SIZE, PAGE_SIZE);
            long total = c.substances() + c.approved() + c.stubs();
            Mono<String> suggestion = total == 0 ? names.suggest(term).map(s -> s).defaultIfEmpty("") : Mono.just("");
            return Mono.zip(port.substances(term, plan.substances().limit(), plan.substances().offset()).collectList(),
                    port.approved(term, plan.approved().limit(), plan.approved().offset()).collectList(),
                    port.stubs(term, plan.stubs().limit(), plan.stubs().offset()).collectList(), suggestion)
                .map(t -> {
                    List<Object> products = new ArrayList<>(t.getT2());
                    products.addAll(t.getT3());
                    return new SearchResult(query, total, (long) (page + 1) * PAGE_SIZE < total,
                        new SearchResult.Counts(c.substances(), c.approved() + c.stubs()), t.getT1(), products,
                        t.getT4().isEmpty() ? null : t.getT4());
                });
        });
    }
}
