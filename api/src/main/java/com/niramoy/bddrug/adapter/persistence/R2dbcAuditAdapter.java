package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.AuditPort;
import com.niramoy.bddrug.domain.AuditEvent;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class R2dbcAuditAdapter implements AuditPort {
    private final DatabaseClient db;
    public R2dbcAuditAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<Long> append(AuditEvent e) {
        DatabaseClient.GenericExecuteSpec spec = db.sql(
                "INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) " +
                "VALUES (:event, :email, :role, :ttype, :tid, :outcome, :rid) RETURNING id")
            .bind("event", e.event()).bind("outcome", e.outcome()).bind("rid", e.requestId());
        spec = nullable(spec, "email", e.actorEmail());
        spec = nullable(spec, "role", e.actorRole());
        spec = nullable(spec, "ttype", e.targetType());
        spec = nullable(spec, "tid", e.targetId());
        return spec.map(r -> r.get("id", Long.class)).one();
    }

    private static DatabaseClient.GenericExecuteSpec nullable(DatabaseClient.GenericExecuteSpec spec, String name, String value) {
        return value == null ? spec.bindNull(name, String.class) : spec.bind(name, value);
    }
}
