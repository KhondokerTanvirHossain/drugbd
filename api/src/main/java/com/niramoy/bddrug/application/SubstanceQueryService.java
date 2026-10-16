package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.SubstanceQueryPort;
import com.niramoy.bddrug.domain.HiddenRecord;
import com.niramoy.bddrug.domain.Scope;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

/** A substance is public once at least one of its products is approved; its public product list holds approved products only. */
@Service
public class SubstanceQueryService {
    private final SubstanceQueryPort port;
    public SubstanceQueryService(SubstanceQueryPort port) { this.port = port; }

    /** Emits a Substance, or a HiddenRecord.Substance for an anonymous request; empty when unknown. */
    public Mono<Object> get(String bdsId, Scope scope) {
        boolean pub = scope == Scope.PUBLIC;
        return port.find(bdsId, pub).map(s -> pub && s.products().isEmpty()
            ? new HiddenRecord.Substance(s.bdsId(), s.preferredName()) : s);
    }
}
