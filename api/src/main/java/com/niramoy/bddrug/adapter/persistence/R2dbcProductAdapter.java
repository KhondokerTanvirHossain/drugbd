package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.domain.Ingredient;
import com.niramoy.bddrug.domain.Product;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.List;

@Component
public class R2dbcProductAdapter implements ProductQueryPort {
    private static final String COLS = "concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag";
    private final DatabaseClient db;
    public R2dbcProductAdapter(DatabaseClient db) { this.db = db; }

    static String likePattern(String term) {
        return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    @Override public Flux<Product> search(String term, int limit, int offset) {
        return db.sql("SELECT " + COLS + " FROM curated.brand_product " +
                      "WHERE lower(trade_name) LIKE :p ESCAPE '\\' OR lower(generic_content_raw) LIKE :p ESCAPE '\\' " +
                      "ORDER BY (lower(trade_name) LIKE :p ESCAPE '\\') DESC, trade_name, concept_id LIMIT :limit OFFSET :offset")
            .bind("p", likePattern(term)).bind("limit", limit).bind("offset", offset)
            .map(R2dbcProductAdapter::toProduct).all();
    }

    @Override public Mono<Product> findByConceptId(String conceptId) {
        Mono<Product> product = db.sql("SELECT " + COLS + " FROM curated.brand_product WHERE concept_id = :id")
            .bind("id", conceptId).map(R2dbcProductAdapter::toProduct).one();
        Mono<List<Ingredient>> ingredients = db.sql(
                "SELECT xm_code, ingredient_name FROM curated.brand_product_ingredient WHERE concept_id = :id ORDER BY xm_code")
            .bind("id", conceptId).map(r -> new Ingredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class)))
            .all().collectList();
        return product.zipWith(ingredients, Product::withIngredients);
    }

    private static Product toProduct(Readable r) {
        return new Product(r.get("concept_id", String.class), r.get("dar_number", String.class), r.get("trade_name", String.class),
            r.get("company", String.class), r.get("dosage_form", String.class), r.get("generic_content_raw", String.class),
            r.get("quality_flag", String.class), List.of());
    }
}
