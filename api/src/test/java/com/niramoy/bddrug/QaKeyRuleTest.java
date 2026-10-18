package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.QaKeyRule;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.Duration;
import java.time.Instant;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.10.2, §7.10.3: the QA key rules (owner roles, name rule, limits, lifetime, status precedence). */
class QaKeyRuleTest {
    static final Instant NOW = Instant.parse("2026-10-18T10:00:00Z");

    @Test void theOwnerRolesAreQaEngineerAndSeniorOnly() {
        assertThat(QaKeyRule.OWNER_ROLES).containsExactlyInAnyOrder("qa", "engineer", "senior");
        assertThat(QaKeyRule.mayOwn("pharmacist")).isFalse();
        assertThat(QaKeyRule.mayOwn("user")).isFalse();
        assertThat(QaKeyRule.mayOwn(null)).isFalse();
        assertThat(QaKeyRule.mayOwn("QA")).isFalse();
        assertThat(QaKeyRule.mayOwn("qa")).isTrue();
    }

    @Test void limitsAndLifetime() {
        assertThat(QaKeyRule.ACTIVE_MAX).isEqualTo(5);
        assertThat(QaKeyRule.DAILY_MAX).isEqualTo(10);
        assertThat(QaKeyRule.LIST_MAX).isEqualTo(50);
        assertThat(QaKeyRule.LIFETIME).isEqualTo(Duration.ofHours(2160)).isEqualTo(Duration.ofDays(90));
    }

    @Test void aNameIsTrimmedOfWhiteSpaceIncludingUnicodeSpaces() {
        assertThat(QaKeyRule.name("  CI laptop  ")).isEqualTo("CI laptop");
        assertThat(QaKeyRule.name("\t\n\r\u000B\f laptop   　﻿     ")).isEqualTo("laptop");
        assertThat(QaKeyRule.name("ল্যাপটপ")).isEqualTo("ল্যাপটপ");
        assertThat(QaKeyRule.name("inner  spaces stay")).isEqualTo("inner  spaces stay");
    }

    @Test void aNameIs1To40CodePoints() {
        assertThat(QaKeyRule.name("n".repeat(40))).hasSize(40);
        assertThat(QaKeyRule.name("n".repeat(41))).isNull();
        assertThat(QaKeyRule.name(" " + "n".repeat(40) + " ")).hasSize(40);
        // 40 astral characters are 80 UTF-16 units but 40 code points
        String emoji = "🔑".repeat(40);
        assertThat(QaKeyRule.name(emoji)).isEqualTo(emoji);
        assertThat(QaKeyRule.name(emoji + "x")).isNull();
        assertThat(QaKeyRule.name("x")).isEqualTo("x");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", " 　", "tab\tinside", "nul\u0000", "del\u007F", "c1\u0085x", "c1\u009Fx", "esc\u001Bx",
        "line inside", "para inside", "\u001Cfile-separator-led"})
    void emptyNamesAndNamesWithControlCharactersAreRefused(String raw) {
        assertThat(QaKeyRule.name(raw)).isNull();
    }

    @Test void aNullNameIsRefused() {
        assertThat(QaKeyRule.name(null)).isNull();
    }

    @Test void revokedWinsOverExpiredWhichWinsOverActive() {
        Instant created = NOW.minus(Duration.ofDays(10)), expires = created.plus(QaKeyRule.LIFETIME);
        assertThat(QaKeyRule.status(null, expires, NOW)).isEqualTo("active");
        assertThat(QaKeyRule.status(NOW.minusSeconds(1), expires, NOW)).isEqualTo("revoked");
        Instant old = NOW.minus(Duration.ofDays(100)), oldExpires = old.plus(QaKeyRule.LIFETIME);
        assertThat(QaKeyRule.status(null, oldExpires, NOW)).isEqualTo("expired");
        assertThat(QaKeyRule.status(old.plusSeconds(5), oldExpires, NOW)).isEqualTo("revoked");
    }

    @Test void aKeyExpiresAtItsExpiryInstant() {
        assertThat(QaKeyRule.status(null, NOW, NOW)).isEqualTo("expired");
        assertThat(QaKeyRule.status(null, NOW.plusMillis(1), NOW)).isEqualTo("active");
    }
}
