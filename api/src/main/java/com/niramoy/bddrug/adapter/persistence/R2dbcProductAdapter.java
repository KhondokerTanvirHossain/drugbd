package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.domain.Ingredient;
import com.niramoy.bddrug.domain.LoadedProduct;
import com.niramoy.bddrug.domain.Product;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.List;

@Component
public class R2dbcProductAdapter implements ProductQueryPort {
    private static final String COLS = "concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, " +
                                       "quality_flag, parse_status, parse_note, bdc_id";
    /** Products with their review status as review_status; filter on it in an outer query. */
    private static final String WITH_STATUS = "SELECT " + COLS + ", " + ReviewSql.statusOf("bp.concept_id") +
                                              " AS review_status FROM curated.brand_product bp";
    private final DatabaseClient db;
    private final ClinicalDrugReader clinicalDrugs;
    public R2dbcProductAdapter(DatabaseClient db, ClinicalDrugReader clinicalDrugs) {
        this.db = db;
        this.clinicalDrugs = clinicalDrugs;
    }

    /** A product row plus the BDC id it links to (resolved into Product.clinicalDrug afterwards). */
    record Row(Product product, String bdcId) {}

    static String likePattern(String term) {
        return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    @Override public Flux<Product> search(String term, int limit, int offset, boolean approvedOnly) {
        return db.sql("SELECT * FROM (" + WITH_STATUS + " " +
                      "WHERE lower(bp.trade_name) LIKE :p ESCAPE '\\' OR lower(bp.generic_content_raw) LIKE :p ESCAPE '\\') p " +
                      (approvedOnly ? "WHERE p.review_status = 'ok' " : "") +
                      "ORDER BY (lower(trade_name) LIKE :p ESCAPE '\\') DESC, trade_name, concept_id LIMIT :limit OFFSET :offset")
            .bind("p", likePattern(term)).bind("limit", limit).bind("offset", offset)
            .map(R2dbcProductAdapter::toRow).all().collectList()
            .flatMapMany(rows -> clinicalDrugs.byIds(rows.stream().map(Row::bdcId).toList())
                .flatMapIterable(cds -> rows.stream().map(r -> r.product().withClinicalDrug(
                    r.bdcId() == null ? null : cds.get(r.bdcId()))).toList()));
    }

    @Override public Mono<Product> findByConceptId(String conceptId) {
        Mono<Product> product = db.sql(WITH_STATUS + " WHERE bp.concept_id = :id")
            .bind("id", conceptId).map(R2dbcProductAdapter::toRow).one()
            .flatMap(r -> r.bdcId() == null ? Mono.just(r.product())
                : clinicalDrugs.byIds(List.of(r.bdcId())).map(cds -> r.product().withClinicalDrug(cds.get(r.bdcId()))));
        Mono<List<Ingredient>> ingredients = db.sql(
                "SELECT xm_code, ingredient_name FROM curated.brand_product_ingredient WHERE concept_id = :id ORDER BY xm_code")
            .bind("id", conceptId).map(r -> new Ingredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class)))
            .all().collectList();
        return product.zipWith(ingredients, Product::withIngredients);
    }

    @Override public Flux<LoadedProduct> loaded(boolean approvedOnly) {
        return db.sql("SELECT concept_id, trade_name, dosage_form FROM (" + WITH_STATUS + ") p " +
                      (approvedOnly ? "WHERE p.review_status = 'ok' " : "") +
                      "ORDER BY lower(trade_name), trade_name, concept_id")
            .map(r -> new LoadedProduct(r.get("concept_id", String.class), r.get("trade_name", String.class),
                r.get("dosage_form", String.class)))
            .all();
    }

    @Override public Mono<LatestItem> latestItem(String conceptId) {
        return db.sql("SELECT batch_id, (note IS NOT DISTINCT FROM '" + ReviewSql.REMOVED_NOTE + "') AS removed FROM ops.batch_item " +
                      "WHERE concept_id = :c ORDER BY extracted_at DESC NULLS LAST, batch_id DESC LIMIT 1")
            .bind("c", conceptId)
            .map(r -> new LatestItem(r.get("batch_id", String.class), Boolean.TRUE.equals(r.get("removed", Boolean.class))))
            .one();
    }

    /** A product row from a query that selects review_status. */
    static Row toRow(Readable r) { return rowWithReview(r, r.get("review_status", String.class)); }

    static Row rowWithReview(Readable r, String reviewStatus) {
        return new Row(new Product(r.get("concept_id", String.class), r.get("dar_number", String.class),
            r.get("trade_name", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
            r.get("generic_content_raw", String.class), r.get("quality_flag", String.class), List.of(),
            r.get("parse_status", String.class), r.get("parse_note", String.class), null, reviewStatus),
            r.get("bdc_id", String.class));
    }
}
