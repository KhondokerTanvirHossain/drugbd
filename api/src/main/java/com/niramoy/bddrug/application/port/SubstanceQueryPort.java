package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Substance;
import com.niramoy.bddrug.domain.SubstanceInteractions;
import reactor.core.publisher.Mono;
import java.util.List;

public interface SubstanceQueryPort {
    /** {@code publicOnly} keeps only visible products (§7.4.1) in {@link Substance#products()}. */
    Mono<Substance> find(String bdsId, boolean publicOnly);
    /** Empty when unknown. */
    Mono<String> preferredName(String bdsId);
    /** True when a visible product carries the substance (§7.4.1). */
    Mono<Boolean> isPublic(String bdsId);
    /** review: the substance's own carried label (§7.4.1), null when no visible product carries it. */
    record InteractionsPage(int total, List<Substance.Entry> counts, List<SubstanceInteractions.Item> items, String review) {}
    /** severity null = all. publicOnly: partnerBdsId only for visible partner substances. */
    Mono<InteractionsPage> interactionsPage(String bdsId, String severity, int limit, int offset, boolean publicOnly);
}
