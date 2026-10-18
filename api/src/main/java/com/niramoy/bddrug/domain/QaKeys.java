package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;

/**
 * QA key shapes (spec §7.10.3). {@link Key} is what create, revoke and list return: never the owner's email, never the hash.
 * {@link Verified} is the verify answer, the only shape that carries an email, for the web server's role check alone (§7.10.8).
 */
public final class QaKeys {
    private QaKeys() {}

    /** A stored row as the adapter reads it, with the database clock ({@code now}) the status is computed against. */
    public record Row(long id, String name, Instant createdAt, Instant expiresAt, Instant lastUsedAt, Instant revokedAt, Instant now) {}

    /** {@code status}: "active", "expired" or "revoked" (QaKeyRule.status). */
    public record Key(long id, String name, Instant createdAt, Instant expiresAt, Instant lastUsedAt, Instant revokedAt, String status) {
        public static Key of(Row r) {
            return new Key(r.id(), r.name(), r.createdAt(), r.expiresAt(), r.lastUsedAt(), r.revokedAt(),
                QaKeyRule.status(r.revokedAt(), r.expiresAt(), r.now()));
        }
    }

    /** The owner's keys, newest first, at most QaKeyRule.LIST_MAX. */
    public record Page(List<Key> keys) {}

    /** An active key's id and owner. */
    public record Verified(long keyId, String ownerEmail) {}
}
