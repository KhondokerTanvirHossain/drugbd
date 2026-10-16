package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import com.niramoy.bddrug.domain.SuggestRow;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;
import java.util.List;

/** scope=public (default) shows approved products only; scope=all needs the internal token. */
@RestController
@RequestMapping("/v1/products")
public class ProductController {
    private final ProductQueryService service;
    private final InternalAuth auth;
    public ProductController(ProductQueryService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ApiResponse<List<Product>>> search(@RequestParam(defaultValue = "") String q,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(required = false) String scope,
                                                   @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.search(q, page, auth.scope(scope, token)).collectList().map(ApiResponse::ok);
    }

    /** The light list for the checker's picker: [{conceptId, tradeName, dosageForm}] by trade name. */
    @GetMapping("/loaded")
    public Mono<ApiResponse<List<LoadedProduct>>> loaded(@RequestParam(required = false) String scope,
                                                         @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.loaded(auth.scope(scope, token)).collectList().map(ApiResponse::ok);
    }

    /** §7.4 P16: at most 10 rows for the checker's combobox. Public data only; a present token must still match. */
    @GetMapping("/suggest")
    public Mono<ApiResponse<List<SuggestRow>>> suggest(@RequestParam(defaultValue = "") String q,
                                                       @RequestParam(required = false) List<String> exclude,
                                                       @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.present(token);
        return service.suggest(q, exclude).collectList().map(ApiResponse::ok);
    }

    /** An unapproved product under public scope is 200 with {conceptId, tradeName, reviewStatus, hidden: true}. */
    @GetMapping("/{conceptId}")
    public Mono<ApiResponse<Object>> get(@PathVariable String conceptId, @RequestParam(required = false) String scope,
                                         @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.get(conceptId, auth.scope(scope, token)).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found")));
    }

    /** §7.4 P10. Under public scope a product that is not public is the stub (as GET /v1/products/{id}), never a result. */
    @GetMapping("/{conceptId}/interactions")
    public Mono<ApiResponse<Object>> interactions(@PathVariable String conceptId, @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(required = false) String scope,
                                                  @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.interactions(conceptId, page, auth.scope(scope, token)).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found")));
    }
}
