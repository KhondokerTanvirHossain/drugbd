package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairContent.Content;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** §7.7: SHA-256 hex of the UTF-8 canonical JSON [a, b, severity, sorted(actions), interaction|null, management|null]. */
class PairContentTest {
    @Test void theCanonicalBytesArePinned() {
        Content c = new Content("moderate", List.of("Synergy", "Metabolism"), "Paracetamol may \"increase\" INR.\nMonitor.", null);
        assertThat(PairContent.canonical("DDInter14", "DDInter1951", c))
            .isEqualTo("[\"DDInter14\",\"DDInter1951\",\"moderate\",[\"Metabolism\",\"Synergy\"],"
                + "\"Paracetamol may \\\"increase\\\" INR.\\nMonitor.\",null]");
        assertThat(PairContent.hash("DDInter14", "DDInter1951", c))
            .isEqualTo("31357de0f95b7cf382acf4bd81d89620f7b689cc456ffab154140c884aea1652");
    }

    @Test void thePilotSeedPairsHashAsPinned() {
        assertThat(PairContent.hash("DDInter14", "DDInter1951", new Content("moderate", List.of(), null, null)))
            .isEqualTo("7e30315f6a7a2b159802317ab92d4b1de80f82517ba6a6af726c3d7a8ecb867f");
        assertThat(PairContent.hash("DDInter1951", "DDInter20", new Content("major", List.of("Monitor", "Avoid"),
            "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
            "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.")))
            .isEqualTo("b1b6e172b724b28b07d074e7ae45ccd14cc3ad4471292b3f1f177840c6bd9043");
    }

    @Test void bengaliTextIsHashedAsUtf8() {
        assertThat(PairContent.hash("DDInter20", "DDInter83", new Content("moderate", List.of("Sinergy"), "বাংলা টেক্সট", null)))
            .isEqualTo("505c5b143577c2be26e448698db232a222d26b0e4c3d009ec24fd5e21adc34af");
    }

    /** Review Focus 3: P0's ETL stores DDInter's "None" as NULL; a cleaned row must not look changed. */
    @Test void placeholderTextHashesLikeNull() {
        String none = PairContent.hash("DDInter14", "DDInter1951", new Content("moderate", List.of(), null, null));
        for (String placeholder : new String[]{"None", " none ", "-", "--", "n/a", "", "   "})
            assertThat(PairContent.hash("DDInter14", "DDInter1951", new Content("moderate", null, placeholder, placeholder)))
                .as(placeholder).isEqualTo(none);
        // surrounding white space is not a change either
        assertThat(PairContent.hash("a", "b", new Content("minor", List.of(), "  text ", null)))
            .isEqualTo(PairContent.hash("a", "b", new Content("minor", List.of(), "text", null)));
    }

    @Test void controlCharactersAreEscapedAsJsonDoes() {
        assertThat(PairContent.canonical("a", "b", new Content("minor", List.of("x\ty"), "\u0001\\", null)))
            .isEqualTo("[\"a\",\"b\",\"minor\",[\"x\\ty\"],\"\\u0001\\\\\",null]");
    }
}
