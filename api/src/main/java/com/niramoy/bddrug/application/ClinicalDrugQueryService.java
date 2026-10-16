package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ClinicalDrugQueryPort;
import com.niramoy.bddrug.domain.ClinicalDrugView;
import com.niramoy.bddrug.domain.Scope;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/** §7.4 P8: under public scope the whole response is 404 unless at least one public product maps to the clinical drug. */
@Service
public class ClinicalDrugQueryService {
    private final ClinicalDrugQueryPort port;
    public ClinicalDrugQueryService(ClinicalDrugQueryPort port) { this.port = port; }

    public Mono<ClinicalDrugView> get(String bdcId, Scope scope) {
        boolean pub = scope == Scope.PUBLIC;
        return port.find(bdcId, pub)
            .filter(v -> !pub || !v.products().isEmpty())
            .switchIfEmpty(Mono.error(() -> new NotFoundException("bdcId", "Clinical drug not found")));
    }
}
