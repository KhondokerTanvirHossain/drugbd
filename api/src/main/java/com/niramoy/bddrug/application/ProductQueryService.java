package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ProductDetailPort;
import com.niramoy.bddrug.application.port.ProductInteractionsPort;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.application.port.ProductQueryPort.LatestItem;
import com.niramoy.bddrug.application.port.SuggestPort;
import com.niramoy.bddrug.domain.ClinicalDrug;
import com.niramoy.bddrug.domain.HiddenRecord;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import com.niramoy.bddrug.domain.ProductBrowse;
import com.niramoy.bddrug.domain.PublicPairs;
import com.niramoy.bddrug.domain.PublicMode;
import com.niramoy.bddrug.domain.PublicProducts;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.SuggestRow;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class ProductQueryService {
    public static final int PAGE_SIZE = 20, MAX_PAGE = 500, MIN_LEN = 2, MAX_LEN = 100;
    public static final int INTERACTIONS_PAGE_MAX = 10_000;
    public static final int SUGGEST_LIMIT = 10, EXCLUDE_MAX = 20;
    /** §6.11.3 P17: 50 rows a page, page index 0–9 (the §6.3 public page cap). */
    public static final int BROWSE_PAGE_SIZE = 50, BROWSE_PAGE_MAX = 9;
    private final ProductQueryPort port;
    private final ProductDetailPort details;
    private final ProductInteractionsPort interactions;
    private final SuggestPort suggestions;
    private final PublicMode mode;
    @Autowired
    public ProductQueryService(ProductQueryPort port, ProductDetailPort details, ProductInteractionsPort interactions,
                               SuggestPort suggestions, PublicMode mode) {
        this.port = port;
        this.details = details;
        this.interactions = interactions;
        this.suggestions = suggestions;
        this.mode = mode;
    }
    public ProductQueryService(ProductQueryPort port, ProductDetailPort details, ProductInteractionsPort interactions,
                               SuggestPort suggestions) {
        this(port, details, interactions, suggestions, PublicMode.APPROVED_ONLY);
    }

    public Flux<Product> search(String q, int page, Scope scope) {
        String term = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (term.length() < MIN_LEN || term.length() > MAX_LEN)
            return Flux.error(new InvalidQueryException("q must be 2-100 characters"));
        if (page < 0 || page > MAX_PAGE)
            return Flux.error(new InvalidQueryException("page must be 0-500"));
        return port.search(term, PAGE_SIZE, page * PAGE_SIZE, scope == Scope.PUBLIC);
    }

    /**
     * Public: the PublicProduct of a visible product with its label, or the §7.4 stub of a hidden one (decided from the label
     * alone, §7.4.1); scope=all: the internal Product. Empty when unknown.
     */
    public Mono<Object> get(String conceptId, Scope scope) {
        return port.findByConceptId(conceptId).flatMap(p -> {
            if (scope != Scope.PUBLIC) return Mono.just((Object) p);
            if (p.review() == null)
                return port.latestItem(conceptId).map(Optional::of).defaultIfEmpty(Optional.empty())
                    .map(item -> (Object) stub(p, item.orElse(null), mode));
            ClinicalDrug cd = p.clinicalDrug();
            return details.facts(conceptId, cd == null ? null : cd.bdcId(), cd == null ? null : cd.route())
                .map(f -> (Object) PublicProducts.assemble(p, f));
        });
    }

    /** §7.4 P10: the grouped pairs of a public product; the stub when it is not public; empty when unknown. */
    public Mono<Object> interactions(String conceptId, int page, Scope scope) {
        if (page < 0 || page > INTERACTIONS_PAGE_MAX)
            return Mono.error(new InvalidQueryException("page", "page must be 0-" + INTERACTIONS_PAGE_MAX));
        return port.findByConceptId(conceptId).flatMap(p -> {
            if (scope == Scope.PUBLIC && p.review() == null)
                return port.latestItem(conceptId).map(Optional::of).defaultIfEmpty(Optional.empty())
                    .map(item -> (Object) stub(p, item.orElse(null), mode));
            return interactions.facts(conceptId).map(f -> (Object) PublicPairs.computeGroups(conceptId, f.route(), f.mine(), f.partners(),
                f.rows(), f.complete(), f.reviews(), page).withReview(p.review()));
        });
    }

    /**
     * §6.4: "removed" whatever the last decision when the latest item left the batch file; in show mode "unavailable" when it
     * is a DGDA load failure (§7.4.1); otherwise "not_reviewed". Approved-only stubs never say "unavailable".
     */
    public static HiddenRecord.Product stub(Product p, LatestItem item, PublicMode mode) {
        String status = item != null && item.removed() ? HiddenRecord.REMOVED
            : item != null && item.loadFailure() && mode.showsUnreviewed() ? HiddenRecord.UNAVAILABLE : HiddenRecord.NOT_REVIEWED;
        return new HiddenRecord.Product(p.conceptId(), p.tradeName(), status, item == null ? null : item.batchId());
    }

    public static HiddenRecord.Product stub(Product p, LatestItem item) { return stub(p, item, PublicMode.APPROVED_ONLY); }

    /**
     * §7.4 P16. Approved-only mode: unapproved rows match on trade name and DAR only and carry no clinical data. Show mode:
     * visible rows only, each in full with its label (§7.4.1).
     */
    public Flux<SuggestRow> suggest(String q, List<String> exclude) {
        if (Validate.hasControl(q)) return Flux.error(new InvalidQueryException("q", "q must not contain control characters"));
        String query = q == null ? "" : q.strip();
        int len = query.codePointCount(0, query.length());
        if (len < MIN_LEN || len > MAX_LEN) return Flux.error(new InvalidQueryException("q", "q must be 2-100 characters"));
        List<String> ids = exclude == null ? List.of() : exclude.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
        if (ids.stream().anyMatch(Validate::hasControl))
            return Flux.error(new InvalidQueryException("exclude", "exclude ids must not contain control characters"));
        if (ids.size() > EXCLUDE_MAX) return Flux.error(new InvalidQueryException("exclude", "exclude holds at most 20 ids"));
        return suggestions.suggest(query.toLowerCase(Locale.ROOT), ids, SUGGEST_LIMIT);
    }

    public Flux<LoadedProduct> loaded(Scope scope) { return port.loaded(scope == Scope.PUBLIC); }

    /**
     * §6.11.3 P17: one page of the A–Z list of visible products under the public mode. {@code letter}: absent or empty for
     * every letter, else A–Z in either case (read upper-case) or 0-9; anything else (whitespace included) is a 400, as is a
     * page outside 0–9.
     */
    public Mono<ProductBrowse> browse(String letter, int page) {
        boolean absent = letter == null || letter.isEmpty();
        String key = absent ? null : ProductBrowse.key(letter);
        if (key == null && !absent)
            return Mono.error(new InvalidQueryException("letter", "letter must be A-Z or 0-9"));
        if (page < 0 || page > BROWSE_PAGE_MAX)
            return Mono.error(new InvalidQueryException("page", "page must be 0-" + BROWSE_PAGE_MAX));
        return Mono.zip(port.browseCounts(), port.browse(key, BROWSE_PAGE_SIZE, page * BROWSE_PAGE_SIZE).collectList())
            .map(t -> ProductBrowse.assemble(key, page, BROWSE_PAGE_SIZE, t.getT1(), t.getT2()));
    }
}
