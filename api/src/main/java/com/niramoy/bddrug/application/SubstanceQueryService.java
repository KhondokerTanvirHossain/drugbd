package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.SubstanceQueryPort;
import com.niramoy.bddrug.domain.HiddenRecord;
import com.niramoy.bddrug.domain.Scope;
import com.niramoy.bddrug.domain.SubstanceInteractions;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.Set;

/** A substance is public once at least one public product carries it (§7.4); otherwise public reads get the stub. */
@Service
public class SubstanceQueryService {
    public static final Set<String> SEVERITIES = Set.of("major", "moderate", "minor", "unknown");
    public static final int PAGE_MAX = 10_000, SIZE_MAX = 50, SIZE_DEFAULT = 20;
    private final SubstanceQueryPort port;
    public SubstanceQueryService(SubstanceQueryPort port) { this.port = port; }

    /** Emits a Substance, or a HiddenRecord.Substance under public scope; empty when unknown. */
    public Mono<Object> get(String bdsId, Scope scope) {
        boolean pub = scope == Scope.PUBLIC;
        return port.find(bdsId, pub).map(s -> pub && s.products().isEmpty()
            ? new HiddenRecord.Substance(s.bdsId(), s.preferredName()) : s);
    }

    /** §7.4 P9: SubstanceInteractions, or the stub under public scope; NotFoundException when unknown. */
    public Mono<Object> interactions(String bdsId, String severity, int page, int size, Scope scope) {
        if (severity != null && !SEVERITIES.contains(severity))
            return Mono.error(new InvalidQueryException("severity", "severity must be one of major, moderate, minor, unknown"));
        if (page < 0 || page > PAGE_MAX) return Mono.error(new InvalidQueryException("page", "page must be 0-" + PAGE_MAX));
        if (size < 1 || size > SIZE_MAX) return Mono.error(new InvalidQueryException("size", "size must be 1-" + SIZE_MAX));
        boolean pub = scope == Scope.PUBLIC;
        return port.preferredName(bdsId)
            .switchIfEmpty(Mono.error(() -> new NotFoundException("bdsId", "Substance not found")))
            .flatMap(name -> (pub ? port.isPublic(bdsId) : Mono.just(true)).flatMap(visible -> visible
                ? port.interactionsPage(bdsId, severity, size, page * size, pub)
                    .map(p -> (Object) new SubstanceInteractions(bdsId, p.counts(), p.total(), page, size, p.items()))
                : Mono.just((Object) new HiddenRecord.Substance(bdsId, name))));
    }
}
