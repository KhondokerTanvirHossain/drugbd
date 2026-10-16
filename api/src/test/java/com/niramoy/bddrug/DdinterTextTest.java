package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.DdinterText;
import com.niramoy.bddrug.domain.CheckResult;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.Substance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

/** DDInter prints "None" (or "-", or nothing) where it has no text: the API serves null, never the placeholder. */
class DdinterTextTest {
    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"None", "none", " NONE ", "null", "NULL", "N/A", "n/a", "NA", "na", "-", "--", "", "   ", "\tNone\n"})
    void placeholdersAndBlanksAreNull(String value) {
        assertThat(DdinterText.clean(value)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Monitor INR.", "None of the above", "No interaction expected.", "-1 dose", "Nan"})
    void realTextIsKept(String value) {
        assertThat(DdinterText.clean(value)).isEqualTo(value);
    }

    @Test void realTextIsStripped() {
        assertThat(DdinterText.clean("  Monitor INR.  ")).isEqualTo("Monitor INR.");
    }

    @Test void anAlertNeverCarriesAPlaceholder() {
        var side = new CheckResult.Side("W-1", "Warin", "BDS-000001", "Warfarin", "systemic");
        var alert = new CheckResult.Alert("unknown", side, side, List.of(), "None", " - ", false, "DDInter1951", "DDInter20", null,
            "DDInter 2.0", PublicPairReviews.NONE);
        assertThat(alert.interaction()).isNull();
        assertThat(alert.management()).isNull();
        var real = new CheckResult.Alert("major", side, side, List.of(), "Bleeding risk.", "Avoid.", false, "DDInter1951", "DDInter20",
            null, "DDInter 2.0", PublicPairReviews.NONE);
        assertThat(real.interaction()).isEqualTo("Bleeding risk.");
        assertThat(real.management()).isEqualTo("Avoid.");
    }

    @Test void diseaseAndFoodTextsNeverCarryAPlaceholder() {
        var disease = new Substance.Disease("Bleeding", "major", "N/A", List.of(), "D-1", "systemic");
        assertThat(disease.text()).isNull();
        var food = new Substance.Food("Alcohol", "minor", null, "null", "", List.of(), "F-1", "systemic");
        assertThat(food.description()).isNull();
        assertThat(food.management()).isNull();
        var realFood = new Substance.Food("Alcohol", "minor", null, "Raises levels.", "Avoid.", List.of(), "F-1", "systemic");
        assertThat(realFood.description()).isEqualTo("Raises levels.");
        assertThat(realFood.management()).isEqualTo("Avoid.");
    }
}
