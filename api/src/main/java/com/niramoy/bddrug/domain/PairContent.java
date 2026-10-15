package com.niramoy.bddrug.domain;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Spec §5.17, §7.7: a DDInter pair's reviewable content and its hash. The canonical form is the JSON array
 * [ddinterA, ddinterB, severity, sorted(actions), interaction or null, management or null], compact, with the texts
 * passed through DdinterText.clean (so "None", "-" and blank equal NULL), encoded as UTF-8. Partner display names are
 * not part of it. PairContentTest pins the bytes.
 */
public final class PairContent {
    private PairContent() {}

    public record Content(String severity, List<String> actions, String interaction, String management) {
        public Content {
            actions = actions == null ? List.of() : actions.stream().sorted().toList();
            interaction = DdinterText.clean(interaction);
            management = DdinterText.clean(management);
        }
    }

    public static String canonical(String a, String b, Content c) {
        return "[" + quote(a) + "," + quote(b) + "," + quote(c.severity()) + ","
            + c.actions().stream().map(PairContent::quote).collect(Collectors.joining(",", "[", "]")) + ","
            + quoteOrNull(c.interaction()) + "," + quoteOrNull(c.management()) + "]";
    }

    public static String hash(String a, String b, Content c) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(canonical(a, b, c).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String quoteOrNull(String s) { return s == null ? "null" : quote(s); }

    /** JSON string escaping: quote, backslash and control characters; everything else literal (RFC 8259). */
    private static String quote(String s) {
        StringBuilder out = new StringBuilder(s.length() + 2).append('"');
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                default -> {
                    if (ch < 0x20) out.append(String.format("\\u%04x", (int) ch));
                    else out.append(ch);
                }
            }
        }
        return out.append('"').toString();
    }
}
