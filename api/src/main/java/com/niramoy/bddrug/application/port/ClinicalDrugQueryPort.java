package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import reactor.core.publisher.Mono;

public interface ClinicalDrugQueryPort {
    /** Empty when unknown. publicOnly keeps only public products in products(). */
    Mono<ClinicalDrugView> find(String bdcId, boolean publicOnly);
}
