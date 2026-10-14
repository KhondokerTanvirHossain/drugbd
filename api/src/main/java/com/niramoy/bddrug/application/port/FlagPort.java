package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagPage;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.UUID;

public interface FlagPort {
    /** Inserts the flag and its flag_created / partner_request audit row in one transaction (§5.15). */
    Mono<Flag> create(String targetType, String targetId, String message, String reporterEmail, UUID requestId);
    /** Newest first. An empty {@code targetTypes} list and a null {@code targetId} or {@code excludeTargetId} mean "any". */
    Mono<FlagPage> list(String status, List<String> targetTypes, String targetId, String excludeTargetId, int page, int size);
    /**
     * Resolves the flag and appends its flag_resolved audit row in one transaction. Errors with NotFoundException for an
     * unknown flag and ConflictException when it is already resolved.
     */
    Mono<Flag> resolve(long id, String resolvedBy, UUID requestId);
}
