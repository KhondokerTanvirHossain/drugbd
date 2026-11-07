package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import com.niramoy.bddrug.domain.ProductBrowse;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.Map;

/**
 * Products carry their internal review status and their public label under the public mode (§7.4.1); {@code publicOnly}
 * keeps only the products that are visible publicly (a non-null label).
 */
public interface ProductQueryPort {
    Flux<Product> search(String normalisedTerm, int limit, int offset, boolean publicOnly);
    Mono<Product> findByConceptId(String conceptId);
    Flux<LoadedProduct> loaded(boolean publicOnly);

    /**
     * §6.11.3 P17: the number of visible products per first-letter key (ProductBrowse.KEYS: A–Z, 0-9), in one grouped read;
     * a key with no visible product is absent.
     */
    Mono<Map<String, Long>> browseCounts();
    /**
     * §6.11.3 P17: visible products whose first-letter key is {@code letter} (every visible product when null), each with
     * its public label, by lower(trade_name), trade_name, concept_id.
     */
    Flux<ProductBrowse.Row> browse(String letter, int limit, int offset);

    /**
     * The product's latest batch item, in ReviewSql's latest-item order; removed = marked "removed from batch file";
     * loadFailure = a DGDA load failure note ("not found at source", "not a registered Drug product").
     */
    record LatestItem(String batchId, boolean removed, boolean loadFailure) {
        public LatestItem(String batchId, boolean removed) { this(batchId, removed, false); }
    }
    /** Empty when the product is in no batch. */
    Mono<LatestItem> latestItem(String conceptId);
}
