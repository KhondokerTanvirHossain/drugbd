package com.niramoy.bddrug.domain;

/** §5.15 audit event names for flag writes (pure). The flag message is never audited. */
public final class FlagAudit {
    private FlagAudit() {}

    /** A partner access request is the flag (other, partner-access) (spec §6.9, D17). */
    public static final String PARTNER_TARGET = "partner-access";

    public static String createdEvent(String targetType, String targetId) {
        return "other".equals(targetType) && PARTNER_TARGET.equals(targetId) ? "partner_request" : "flag_created";
    }
}
