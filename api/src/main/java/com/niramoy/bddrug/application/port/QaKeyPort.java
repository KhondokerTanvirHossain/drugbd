package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.QaKeys;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.UUID;

/** Self-service QA keys in ops.qa_key (spec §7.10.3). Emails arrive validated and lower-cased; nothing here is logged. */
public interface QaKeyPort {
    /**
     * In one transaction, under a per-owner advisory lock: refuses with ConflictException {@code activeKeys} at
     * {@code activeMax} active keys and {@code createdToday} at {@code dailyMax} keys created in the last 24 hours; inserts the
     * key (created now, expiring 2160 hours later) and its qa_key_created audit row. A duplicate hash is ConflictException
     * {@code keyHash}. A key never exists without its audit row.
     */
    Mono<QaKeys.Row> create(String ownerEmail, String ownerRole, String name, String keyHash, UUID requestId, int activeMax, int dailyMax);

    /**
     * In one transaction: locks the owner's key with that id (NotFoundException {@code id} when there is none, the same answer
     * for another owner's key), refuses an already revoked one (ConflictException {@code status}), sets revoked_at and appends
     * its qa_key_revoked audit row.
     */
    Mono<QaKeys.Row> revoke(long id, String ownerEmail, String ownerRole, UUID requestId);

    /** The owner's keys, newest first (created_at DESC, id DESC), at most {@code max}. */
    Mono<List<QaKeys.Row>> list(String ownerEmail, int max);

    /** Read-only: the active key with that hash, or empty for an unknown, revoked or expired one. */
    Mono<QaKeys.Verified> verify(String keyHash);

    /**
     * Sets last_used_at to now when the key is active and its last use is unset or at least a minute old. True when a key with
     * that id exists, whether or not it changed.
     */
    Mono<Boolean> touch(long id);
}
