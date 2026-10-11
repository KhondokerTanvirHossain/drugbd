package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.FlagPort;
import com.niramoy.bddrug.domain.Flag;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;

@Component
public class R2dbcFlagAdapter implements FlagPort {
    private static final String COLS =
        "id, target_type, target_id, message, reporter_email, status, created_at, resolved_at, resolved_by";
    private static final int LIST_LIMIT = 500;

    private final DatabaseClient db;
    public R2dbcFlagAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<Flag> create(String targetType, String targetId, String message, String reporterEmail) {
        return db.sql("INSERT INTO ops.flag (target_type, target_id, message, reporter_email) " +
                      "VALUES (:type, :target, :message, :email) RETURNING " + COLS)
            .bind("type", targetType).bind("target", targetId).bind("message", message).bind("email", reporterEmail)
            .map(R2dbcFlagAdapter::toFlag).one();
    }

    @Override public Flux<Flag> list(String status) {
        return db.sql("SELECT " + COLS + " FROM ops.flag WHERE status = :s ORDER BY created_at DESC, id DESC LIMIT :n")
            .bind("s", status).bind("n", LIST_LIMIT).map(R2dbcFlagAdapter::toFlag).all();
    }

    @Override public Mono<Flag> resolve(long id, String resolvedBy) {
        return db.sql("UPDATE ops.flag SET status = 'resolved', resolved_at = now(), resolved_by = :by " +
                      "WHERE id = :id AND status = 'open' RETURNING " + COLS)
            .bind("by", resolvedBy).bind("id", id).map(R2dbcFlagAdapter::toFlag).one()
            .switchIfEmpty(Mono.defer(() -> db.sql("SELECT EXISTS (SELECT 1 FROM ops.flag WHERE id = :id) AS found")
                .bind("id", id).map(r -> r.get("found", Boolean.class)).one()
                .flatMap(found -> Mono.error(found ? new ConflictException("id", "Flag is already resolved")
                                                   : new NotFoundException("id", "Flag not found")))));
    }

    private static Flag toFlag(Readable r) {
        OffsetDateTime resolved = r.get("resolved_at", OffsetDateTime.class);
        return new Flag(r.get("id", Long.class), r.get("target_type", String.class), r.get("target_id", String.class),
            r.get("message", String.class), r.get("reporter_email", String.class), r.get("status", String.class),
            r.get("created_at", OffsetDateTime.class).toInstant(), resolved == null ? null : resolved.toInstant(),
            r.get("resolved_by", String.class));
    }
}
