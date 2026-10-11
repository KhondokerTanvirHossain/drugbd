package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
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

    /** An unapproved product under public scope is 200 with {conceptId, tradeName, reviewStatus, hidden: true}. */
    @GetMapping("/{conceptId}")
    public Mono<ApiResponse<Object>> get(@PathVariable String conceptId, @RequestParam(required = false) String scope,
                                         @RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        return service.get(conceptId, auth.scope(scope, token)).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found")));
    }
}
