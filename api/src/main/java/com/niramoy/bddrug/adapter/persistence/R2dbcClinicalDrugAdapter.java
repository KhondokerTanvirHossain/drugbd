package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ClinicalDrugQueryPort;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;

/** P8 reads. Public status only through ReviewSql.LATEST_PUBLIC (§7.4, PO D7). */
@Component
public class R2dbcClinicalDrugAdapter implements ClinicalDrugQueryPort {
    private record Head(String bdcId, String displayName, String doseForm, String route) {}
    private final DatabaseClient db;
    public R2dbcClinicalDrugAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<ClinicalDrugView> find(String bdcId, boolean publicOnly) {
        Mono<Head> head = db.sql("SELECT bdc_id, display_name, dose_form, route FROM curated.clinical_drug WHERE bdc_id = :id")
            .bind("id", bdcId)
            .map(r -> new Head(r.get("bdc_id", String.class), r.get("display_name", String.class), r.get("dose_form", String.class),
                r.get("route", String.class)))
            .one();
        return head.flatMap(h -> Mono.zip(
            db.sql("""
                    SELECT i.bds_id, s.preferred_name, i.strength_value, i.strength_unit, i.per_value, i.per_unit
                    FROM curated.clinical_drug_ingredient i JOIN curated.substance s ON s.bds_id = i.bds_id
                    WHERE i.bdc_id = :id ORDER BY lower(s.preferred_name), i.bds_id""")
                .bind("id", bdcId)
                .map(r -> new ClinicalDrugView.Ingredient(r.get("bds_id", String.class), r.get("preferred_name", String.class),
                    ClinicalDrugReader.plain(r.get("strength_value", BigDecimal.class)), r.get("strength_unit", String.class),
                    ClinicalDrugReader.plain(r.get("per_value", BigDecimal.class)), r.get("per_unit", String.class)))
                .all().collectList(),
            db.sql("WITH " + ReviewSql.LATEST_PUBLIC + " " +
                   "SELECT bp.concept_id, bp.trade_name, bp.company, bp.dar_number FROM curated.brand_product bp " +
                   "LEFT JOIN latest l ON l.concept_id = bp.concept_id " +
                   "WHERE bp.bdc_id = :id AND (NOT :pub OR coalesce(l.pub, false)) " +
                   "ORDER BY lower(bp.trade_name), bp.concept_id")
                .bind("id", bdcId).bind("pub", publicOnly)
                .map(r -> new ClinicalDrugView.ProductRef(r.get("concept_id", String.class), r.get("trade_name", String.class),
                    r.get("company", String.class), r.get("dar_number", String.class)))
                .all().collectList())
            .map(t -> new ClinicalDrugView(h.bdcId(), h.displayName(), h.doseForm(), h.route(), t.getT1(), t.getT2())));
    }
}
