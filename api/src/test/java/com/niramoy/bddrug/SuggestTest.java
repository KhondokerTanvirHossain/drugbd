package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.Suggest;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class SuggestTest {
    @Test void distanceCountsInsertionsDeletionsSubstitutionsAndAdjacentSwaps() {
        assertThat(Suggest.distance("warfrin", "warfarin")).isEqualTo(1);
        assertThat(Suggest.distance("paracetmaol", "paracetamol")).isEqualTo(1);   // adjacent swap
        assertThat(Suggest.distance("napa", "nepa")).isEqualTo(1);
        assertThat(Suggest.distance("aspirin", "aspirin")).isZero();
        assertThat(Suggest.distance("", "abc")).isEqualTo(3);
    }

    @Test void closestTakesDistanceOneOrTwoCaseInsensitivelyAndNeverTheSameName() {
        assertThat(Suggest.closest("warfrin", List.of("Warfarin", "Warin", "Aspirin"))).isEqualTo("Warfarin");
        assertThat(Suggest.closest("warfarin", List.of("Warfarin"))).isNull();
        assertThat(Suggest.closest("zzzzzzz", List.of("Warfarin"))).isNull();
        assertThat(Suggest.closest("amlodipne", List.of("Amlodipine", "Amlodipine-5"))).isEqualTo("Amlodipine");
    }

    @Test void tiesGoToTheAlphabeticallyFirstName() {
        assertThat(Suggest.closest("napax", List.of("Napay", "Napaa"))).isEqualTo("Napaa");
    }
}
