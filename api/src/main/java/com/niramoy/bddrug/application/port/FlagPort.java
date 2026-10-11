package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Flag;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface FlagPort {
    Mono<Flag> create(String targetType, String targetId, String message, String reporterEmail);
    Flux<Flag> list(String status);
    /** Errors with NotFoundException for an unknown flag and ConflictException when it is already resolved. */
    Mono<Flag> resolve(long id, String resolvedBy);
}
