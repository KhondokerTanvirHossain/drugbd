package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.AuditEvent;
import reactor.core.publisher.Mono;

public interface AuditPort {
    /** Appends one row and returns its id. The table is append-only (V6 triggers reject UPDATE, DELETE, TRUNCATE). */
    Mono<Long> append(AuditEvent event);
}
