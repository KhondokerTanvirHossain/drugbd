package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Spec §7.3 /diff: the cells that differ between two snapshot payloads (v1), over a fixed field list. A cell that is
 * absent on one side (an ingredient added or dropped) is null there. Numbers are compared as numbers ("5" = "5.0").
 */
public final class SnapshotDiff {
    private SnapshotDiff() {}

    public record Row(String field, String before, String now) {}

    private static final List<String[]> STAGES = List.of(new String[]{"dgda", "DGDA load"}, new String[]{"substances", "Substances"},
        new String[]{"clinical", "Clinical drug"}, new String[]{"ddinter", "DDInter"});

    public static List<Row> diff(JsonNode before, JsonNode now) {
        List<Row> rows = new ArrayList<>();
        add(rows, "Trade name", text(before, "brand", "trade_name"), text(now, "brand", "trade_name"));
        add(rows, "Company", text(before, "brand", "company"), text(now, "brand", "company"));
        add(rows, "Dosage form", text(before, "brand", "dosage_form"), text(now, "brand", "dosage_form"));
        add(rows, "Generic content", text(before, "brand", "generic_content_raw"), text(now, "brand", "generic_content_raw"));
        add(rows, "Clinical drug", clinical(before), clinical(now));
        add(rows, "Route", text(before, "clinical_drug", "route"), text(now, "clinical_drug", "route"));
        JsonNode ib = before.path("ingredients"), in = now.path("ingredients");
        int n = Math.max(ib.size(), in.size());
        for (int i = 0; i < n; i++) {
            String suffix = n > 1 ? " " + (i + 1) : "";
            JsonNode a = i < ib.size() ? ib.get(i) : null, b = i < in.size() ? in.get(i) : null;
            add(rows, "Substance" + suffix, substance(a), substance(b));
            add(rows, "Strength" + suffix, strength(a), strength(b));
            add(rows, "Codes" + suffix, codes(a), codes(b));
            add(rows, "DDInter entries" + suffix, entries(a), entries(b));
        }
        for (String[] s : STAGES) {
            add(rows, s[1] + " check", text(before, "stages", s[0], "status"), text(now, "stages", s[0], "status"));
            add(rows, s[1] + " note", text(before, "stages", s[0], "note"), text(now, "stages", s[0], "note"));
        }
        add(rows, "Pipeline extracted at", text(before, "extracted_at"), text(now, "extracted_at"));
        return List.copyOf(rows);
    }

    private static void add(List<Row> rows, String field, String before, String now) {
        if (!Objects.equals(before, now)) rows.add(new Row(field, before, now));
    }

    private static String text(JsonNode root, String... path) {
        JsonNode n = root;
        for (String p : path) n = n == null ? null : n.get(p);
        return n == null || n.isNull() ? null : n.asText();
    }

    private static String clinical(JsonNode p) {
        String name = text(p, "clinical_drug", "display_name"), id = text(p, "clinical_drug", "bdc_id");
        return name == null ? null : name + " (" + id + ")";
    }

    private static String substance(JsonNode ing) {
        if (ing == null) return null;
        String name = text(ing, "substance") != null ? text(ing, "substance") : text(ing, "name");
        String bds = text(ing, "bds_id");
        return bds == null ? name : name + " (" + bds + ")";
    }

    private static String strength(JsonNode ing) {
        if (ing == null) return null;
        JsonNode s = ing.get("strength");
        if (s == null || s.isNull()) return "";
        String text = number(text(s, "value")) + " " + text(s, "unit");
        String per = number(text(s, "per_value"));
        return per == null ? text : text + " per " + per + " " + text(s, "per_unit");
    }

    private static String number(String v) {
        if (v == null) return null;
        try {
            BigDecimal d = new BigDecimal(v).stripTrailingZeros();
            return (d.scale() < 0 ? d.setScale(0) : d).toPlainString();
        } catch (NumberFormatException e) {
            return v;
        }
    }

    private static String codes(JsonNode ing) {
        if (ing == null) return null;
        List<String> out = new ArrayList<>();
        for (JsonNode c : ing.path("codes")) if (!"DDINTER".equals(text(c, "system"))) out.add(text(c, "system") + " " + text(c, "code"));
        out.sort(String::compareTo);
        return String.join(", ", out);
    }

    private static String entries(JsonNode ing) {
        if (ing == null) return null;
        List<String> out = new ArrayList<>();
        for (JsonNode id : ing.path("ddinter_chosen")) out.add(id.asText());
        String text = String.join(", ", out);
        return ing.path("route_assumed").asBoolean(false) && !out.isEmpty() ? text + ", route assumed" : text;
    }
}
