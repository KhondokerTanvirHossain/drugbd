package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.AuditPort;
import com.niramoy.bddrug.application.port.FlagPort;
import com.niramoy.bddrug.domain.AuditEvent;
import com.niramoy.bddrug.domain.Flag;
import com.niramoy.bddrug.domain.FlagAudit;
import com.niramoy.bddrug.domain.FlagPage;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Flags and their §5.15 audit rows. The transaction lives here, as in P0's R2dbcReviewAdapter: the flag write and the
 * audit row commit together or not at all. The audit adapter shares the connection through the transaction context.
 */
@Component
public class R2dbcFlagAdapter implements FlagPort {
    private static final String COLS =
        "id, target_type, target_id, message, reporter_email, status, created_at, resolved_at, resolved_by";

    private final DatabaseClient db;
    private final TransactionalOperator tx;
    private final AuditPort audit;
    public R2dbcFlagAdapter(DatabaseClient db, TransactionalOperator tx, AuditPort audit) {
        this.db = db;
        this.tx = tx;
        this.audit = audit;
    }

    @Override public Mono<Flag> create(String targetType, String targetId, String message, String reporterEmail,
                                       UUID requestId) {
        return tx.transactional(db.sql("INSERT INTO ops.flag (target_type, target_id, message, reporter_email) " +
                      "VALUES (:type, :target, :message, :email) RETURNING " + COLS)
            .bind("type", targetType).bind("target", targetId).bind("message", message).bind("email", reporterEmail)
            .map(R2dbcFlagAdapter::toFlag).one()
            .flatMap(f -> audit.append(new AuditEvent(FlagAudit.createdEvent(f.targetType(), f.targetId()), f.reporterEmail(),
                    null, "flag", String.valueOf(f.id()), "accepted", requestId)).thenReturn(f)));
    }

    /** One extra row tells whether another page exists. */
    @Override public Mono<FlagPage> list(String status, List<String> targetTypes, String targetId, String excludeTargetId,
                                         int page, int size) {
        String where = "status = :s" + (targetTypes.isEmpty() ? "" : " AND target_type = ANY(:types)")
            + (targetId == null ? "" : " AND target_id = :tid")
            + (excludeTargetId == null ? "" : " AND target_id <> :xtid");
        DatabaseClient.GenericExecuteSpec spec = db.sql("SELECT " + COLS + " FROM ops.flag WHERE " + where +
                " ORDER BY created_at DESC, id DESC LIMIT :n OFFSET :o")
            .bind("s", status).bind("n", size + 1).bind("o", (long) page * size);
        if (!targetTypes.isEmpty()) spec = spec.bind("types", targetTypes.toArray(String[]::new));
        if (targetId != null) spec = spec.bind("tid", targetId);
        if (excludeTargetId != null) spec = spec.bind("xtid", excludeTargetId);
        return spec.map(R2dbcFlagAdapter::toFlag).all().collectList()
            .map(rows -> new FlagPage(List.copyOf(rows.subList(0, Math.min(size, rows.size()))), page, size, rows.size() > size));
    }

    @Override public Mono<Flag> resolve(long id, String resolvedBy, UUID requestId) {
        return tx.transactional(db.sql("UPDATE ops.flag SET status = 'resolved', resolved_at = now(), resolved_by = :by " +
                      "WHERE id = :id AND status = 'open' RETURNING " + COLS)
            .bind("by", resolvedBy).bind("id", id).map(R2dbcFlagAdapter::toFlag).one()
            .switchIfEmpty(Mono.defer(() -> db.sql("SELECT EXISTS (SELECT 1 FROM ops.flag WHERE id = :id) AS found")
                .bind("id", id).map(r -> r.get("found", Boolean.class)).one()
                .flatMap(found -> Mono.error(found ? new ConflictException("id", "Flag is already resolved")
                                                   : new NotFoundException("id", "Flag not found")))))
            .flatMap(f -> audit.append(new AuditEvent("flag_resolved", resolvedBy, null, "flag", String.valueOf(f.id()),
                    "resolved", requestId)).thenReturn(f)));
    }

    private static Flag toFlag(Readable r) {
        OffsetDateTime resolved = r.get("resolved_at", OffsetDateTime.class);
        return new Flag(r.get("id", Long.class), r.get("target_type", String.class), r.get("target_id", String.class),
            r.get("message", String.class), r.get("reporter_email", String.class), r.get("status", String.class),
            r.get("created_at", OffsetDateTime.class).toInstant(), resolved == null ? null : resolved.toInstant(),
            r.get("resolved_by", String.class));
    }
}
