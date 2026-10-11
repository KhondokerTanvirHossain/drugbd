package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.domain.Product;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;
import java.util.List;

@RestController
@RequestMapping("/v1/products")
public class ProductController {
    private final ProductQueryService service;
    public ProductController(ProductQueryService service) { this.service = service; }

    @GetMapping
    public Mono<ApiResponse<List<Product>>> search(@RequestParam(defaultValue = "") String q,
                                                   @RequestParam(defaultValue = "0") int page) {
        return service.search(q, page).collectList().map(ApiResponse::ok);
    }

    @GetMapping("/{conceptId}")
    public Mono<ApiResponse<Product>> get(@PathVariable String conceptId) {
        return service.get(conceptId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found")));
    }
}
