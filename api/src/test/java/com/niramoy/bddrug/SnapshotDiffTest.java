package com.niramoy.bddrug;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.domain.SnapshotDiff;
import com.niramoy.bddrug.domain.SnapshotDiff.Row;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

/** Spec §7.3 /diff: a fixed field list compared between two snapshot payloads (v1). */
class SnapshotDiffTest {
    static final ObjectMapper JSON = new ObjectMapper();

    static JsonNode payload(String tradeName, String strengthValue, String ddinterNote, String chosen, String extractedAt,
                            String secondIngredient) throws Exception {
        String ing = """
            {"xm_code":"XM2TE7","name":"Chloramphenicol","bds_id":"BDS-000009","substance":"Chloramphenicol",
             "strength":{"raw":"Chloramphenicol 5 mg/ml","value":"%s","unit":"mg","per_value":"1","per_unit":"ml"},
             "codes":[{"system":"ICD11_XM","code":"XM2TE7","route_scope":"any"},{"system":"ATC","code":"S01AA01","route_scope":"any"},
                      {"system":"DDINTER","code":"DDInter352","route_scope":"ophthalmic"}],
             "ddinter_chosen":[%s],"route_assumed":false}""".formatted(strengthValue, chosen);
        return JSON.readTree("""
            {"version":1,"extracted_at":"%s",
             "brand":{"dar_number":"127-0163-052","trade_name":"%s","company":"EDCL (Dhaka)","dosage_form":"Eye Drops",
                      "generic_content_raw":"Chloramphenicol 5 mg/ml"},
             "clinical_drug":{"bdc_id":"BDC-000008","display_name":"Chloramphenicol 5 mg/ml eye drops","dose_form":"Eye Drops","route":"ophthalmic"},
             "ingredients":[%s%s],
             "stages":{"dgda":{"status":"ok","note":""},"ddinter":{"status":"warn","note":"%s"}}}"""
            .formatted(extractedAt, tradeName, ing, secondIngredient == null ? "" : "," + secondIngredient, ddinterNote));
    }

    @Test void identicalPayloadsHaveNoRows() throws Exception {
        JsonNode a = payload("Chloramphenicol", "5", "n", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        assertThat(SnapshotDiff.diff(a, a)).isEmpty();
    }

    @Test void changedCellsAreListedInTheFixedOrder() throws Exception {
        JsonNode before = payload("Chloramphenicol", "5", "DDInter text not found for DDInter14/DDInter351", "\"DDInter351\"",
            "2026-10-11T21:30:00Z", null);
        JsonNode now = payload("Chloramphenicol Eye", "5.0", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(
            new Row("Trade name", "Chloramphenicol", "Chloramphenicol Eye"),
            new Row("DDInter entries", "DDInter351", "DDInter352"),
            new Row("DDInter note", "DDInter text not found for DDInter14/DDInter351", ""),
            new Row("Pipeline extracted at", "2026-10-11T21:30:00Z", "2026-10-12T09:00:00Z"));
    }

    @Test void strengthsAreComparedAsNumbersAndWrittenWithTheirPer() throws Exception {
        JsonNode before = payload("C", "5", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        JsonNode now = payload("C", "0.50", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(new Row("Strength", "5 mg per 1 ml", "0.5 mg per 1 ml"));
    }

    @Test void severalIngredientsAreNumberedAndAnAddedOneHasNoBefore() throws Exception {
        String second = """
            {"xm_code":"XM7CM1","name":"Amoxicillin","bds_id":"BDS-000008","substance":"Amoxicillin","strength":null,
             "codes":[],"ddinter_chosen":[],"route_assumed":false}""";
        JsonNode before = payload("C", "5", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", null);
        JsonNode now = payload("C", "5", "", "\"DDInter352\"", "2026-10-12T09:00:00Z", second);
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(
            new Row("Substance 2", null, "Amoxicillin (BDS-000008)"),
            new Row("Strength 2", null, ""),
            new Row("Codes 2", null, ""),
            new Row("DDInter entries 2", null, ""));
    }

    @Test void stageStatusChangesUseTheStageName() throws Exception {
        JsonNode before = JSON.readTree("{\"version\":1,\"extracted_at\":\"x\",\"brand\":null,\"clinical_drug\":null,\"ingredients\":[],"
            + "\"stages\":{\"clinical\":{\"status\":\"fail\",\"note\":\"no strength\"}}}");
        JsonNode now = JSON.readTree("{\"version\":1,\"extracted_at\":\"x\",\"brand\":null,\"clinical_drug\":null,\"ingredients\":[],"
            + "\"stages\":{\"clinical\":{\"status\":\"ok\",\"note\":\"\"}}}");
        assertThat(SnapshotDiff.diff(before, now)).containsExactly(
            new Row("Clinical drug check", "fail", "ok"), new Row("Clinical drug note", "no strength", ""));
    }
}
