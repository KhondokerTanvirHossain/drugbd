package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Substance;
import com.niramoy.bddrug.domain.SubstanceInteractions;
import reactor.core.publisher.Mono;
import java.util.List;

public interface SubstanceQueryPort {
    /** {@code approvedOnly} keeps only approved products in {@link Substance#products()}. */
    Mono<Substance> find(String bdsId, boolean approvedOnly);
    /** Empty when unknown. */
    Mono<String> preferredName(String bdsId);
    /** True when a public product carries the substance (§7.4). */
    Mono<Boolean> isPublic(String bdsId);
    record InteractionsPage(int total, List<Substance.Entry> counts, List<SubstanceInteractions.Item> items) {}
    /** severity null = all. publicOnly: partnerBdsId only for public partner substances. */
    Mono<InteractionsPage> interactionsPage(String bdsId, String severity, int limit, int offset, boolean publicOnly);
}
