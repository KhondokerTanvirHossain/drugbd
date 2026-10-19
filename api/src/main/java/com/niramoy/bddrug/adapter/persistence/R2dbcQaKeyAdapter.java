package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.ConflictException;
import com.niramoy.bddrug.application.NotFoundException;
import com.niramoy.bddrug.application.port.AuditPort;
import com.niramoy.bddrug.application.port.QaKeyPort;
import com.niramoy.bddrug.domain.AuditEvent;
import com.niramoy.bddrug.domain.QaKeys;
import io.r2dbc.spi.Readable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.reactive.TransactionalOperator;
import reactor.core.publisher.Mono;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * ops.qa_key (spec §7.10.3, V9). Create and revoke write the key and its qa_key_created / qa_key_revoked audit row in one
 * transaction, as R2dbcFlagAdapter does; the audit adapter shares the connection through the transaction context. Emails are
 * compared and stored as {@code lower(...)}, so the V9 lower-case check always holds. Every row is read with the database
 * clock ({@code now()}) its status is computed against. No statement here is logged with its values.
 */
@Component
public class R2dbcQaKeyAdapter implements QaKeyPort {
    private static final String COLS = "id, name, created_at, expires_at, last_used_at, revoked_at, now() AS db_now";
    private static final String ACTIVE = "revoked_at IS NULL AND expires_at > now()";

    private final DatabaseClient db;
    private final TransactionalOperator tx;
    private final AuditPort audit;
    public R2dbcQaKeyAdapter(DatabaseClient db, TransactionalOperator tx, AuditPort audit) {
        this.db = db;
        this.tx = tx;
        this.audit = audit;
    }

    private record Counts(long active, long recent) {}

    @Override public Mono<QaKeys.Row> create(String ownerEmail, String ownerRole, String name, String keyHash, UUID requestId,
                                             int activeMax, int dailyMax) {
        // The advisory lock serialises one owner's creates, so two concurrent requests cannot both pass the caps.
        Mono<QaKeys.Row> work = db.sql("SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('ops.qa_key:' || " +
                    "lower(:email), 0))) AS l")
            .bind("email", ownerEmail).map(r -> 1).one()
            .then(db.sql("SELECT count(*) FILTER (WHERE " + ACTIVE + ") AS active, " +
                    "count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS recent " +
                    "FROM ops.qa_key WHERE owner_email = lower(:email)")
                .bind("email", ownerEmail)
                .map(r -> new Counts(r.get("active", Long.class), r.get("recent", Long.class))).one())
            .flatMap(c -> {
                if (c.active() >= activeMax)
                    return Mono.error(new ConflictException("activeKeys", "You already have " + activeMax + " active keys"));
                if (c.recent() >= dailyMax)
                    return Mono.error(new ConflictException("createdToday", "You have created " + dailyMax + " keys in the last 24 hours"));
                return db.sql("INSERT INTO ops.qa_key (key_hash, owner_email, name, expires_at) " +
                        "VALUES (:hash, lower(:email), :name, now() + interval '2160 hours') RETURNING " + COLS)
                    .bind("hash", keyHash).bind("email", ownerEmail).bind("name", name)
                    .map(R2dbcQaKeyAdapter::toRow).one();
            })
            .flatMap(row -> audit.append(new AuditEvent("qa_key_created", ownerEmail, ownerRole, "qa_key", String.valueOf(row.id()),
                    "ok", requestId)).thenReturn(row));
        return tx.transactional(work)
            .onErrorMap(DuplicateKeyException.class, e -> new ConflictException("keyHash", "This key already exists"));
    }

    @Override public Mono<QaKeys.Row> revoke(long id, String ownerEmail, String ownerRole, UUID requestId) {
        Mono<QaKeys.Row> work = db.sql("SELECT " + COLS + " FROM ops.qa_key WHERE id = :id AND owner_email = lower(:email) FOR UPDATE")
            .bind("id", id).bind("email", ownerEmail).map(R2dbcQaKeyAdapter::toRow).one()
            .switchIfEmpty(Mono.error(() -> new NotFoundException("id", "QA key not found")))
            .flatMap(row -> row.revokedAt() != null
                ? Mono.<QaKeys.Row>error(new ConflictException("status", "This key is already revoked"))
                : db.sql("UPDATE ops.qa_key SET revoked_at = now() WHERE id = :id RETURNING " + COLS)
                    .bind("id", id).map(R2dbcQaKeyAdapter::toRow).one())
            .flatMap(row -> audit.append(new AuditEvent("qa_key_revoked", ownerEmail, ownerRole, "qa_key", String.valueOf(row.id()),
                    "ok", requestId)).thenReturn(row));
        return tx.transactional(work);
    }

    @Override public Mono<List<QaKeys.Row>> list(String ownerEmail, int max) {
        return db.sql("SELECT " + COLS + " FROM ops.qa_key WHERE owner_email = lower(:email) ORDER BY created_at DESC, id DESC LIMIT :n")
            .bind("email", ownerEmail).bind("n", max).map(R2dbcQaKeyAdapter::toRow).all().collectList();
    }

    @Override public Mono<QaKeys.Verified> verify(String keyHash) {
        return db.sql("SELECT id, owner_email FROM ops.qa_key WHERE key_hash = :hash AND " + ACTIVE)
            .bind("hash", keyHash)
            .map(r -> new QaKeys.Verified(r.get("id", Long.class), r.get("owner_email", String.class))).one();
    }

    @Override public Mono<Boolean> touch(long id) {
        // One statement: the update runs whatever the outer SELECT finds; the guard trigger keeps last_used_at moving forward.
        return db.sql("WITH touched AS (UPDATE ops.qa_key SET last_used_at = now() WHERE id = :id AND " + ACTIVE +
                    " AND (last_used_at IS NULL OR last_used_at <= now() - interval '1 minute') RETURNING id) " +
                    "SELECT EXISTS (SELECT 1 FROM ops.qa_key WHERE id = :id) AS found")
            .bind("id", id).map(r -> r.get("found", Boolean.class)).one();
    }

    private static Instant instant(Readable r, String column) {
        OffsetDateTime t = r.get(column, OffsetDateTime.class);
        return t == null ? null : t.toInstant();
    }

    private static QaKeys.Row toRow(Readable r) {
        return new QaKeys.Row(r.get("id", Long.class), r.get("name", String.class), instant(r, "created_at"), instant(r, "expires_at"),
            instant(r, "last_used_at"), instant(r, "revoked_at"), instant(r, "db_now"));
    }
}
