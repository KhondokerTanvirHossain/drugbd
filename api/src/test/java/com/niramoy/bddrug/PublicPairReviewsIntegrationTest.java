package com.niramoy.bddrug;

import com.niramoy.bddrug.adapter.persistence.PairReviewReader;
import com.niramoy.bddrug.domain.PairReviewRule;
import com.niramoy.bddrug.domain.PublicPairReviews;
import com.niramoy.bddrug.domain.PublicPairReviews.Pair;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import static com.niramoy.bddrug.TestSupport.exec;
import static org.assertj.core.api.Assertions.assertThat;

/** The call shape every P2 adapter uses: P1C's one query, then the public form of all four states (§7.4). */
@Testcontainers
@SpringBootTest
class PublicPairReviewsIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }

    // PilotSeed: DDInter1951+DDInter20 major {Monitor,Avoid} with text IA-1; DDInter1951+DDInter351 moderate {Monitor} IA-2;
    // DDInter14+DDInter1951 moderate, no text; DDInter1951+DDInter999 minor, no text.
    static final Pair WA = new Pair("DDInter1951", "DDInter20", "major", List.of("Monitor", "Avoid"),
        "Aspirin may increase the anticoagulant effect of warfarin and the risk of bleeding.",
        "Avoid the combination unless the benefit outweighs the bleeding risk; monitor INR.");
    static final Pair WC = new Pair("DDInter1951", "DDInter351", "moderate", List.of("Monitor"),
        "Chloramphenicol may increase the serum concentration of warfarin.", "Monitor INR.");
    static final Pair AW = new Pair("DDInter14", "DDInter1951", "moderate", List.of(), null, null);
    static final Pair WH = new Pair("DDInter1951", "DDInter999", "minor", List.of(), null, null);

    @BeforeAll static void seed() throws Exception {
        PilotSeed.migrateAndSeed(pg);
        exec(pg, """
            INSERT INTO ops.pair_review (ddinter_a, ddinter_b, decision, note, content_hash, content, reviewer_email, reviewer_role, decided_at) VALUES
             ('DDInter1951','DDInter20','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:20:00Z'),
             ('DDInter1951','DDInter351','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:21:00Z'),
             ('DDInter14','DDInter1951','reviewed','', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:22:00Z'),
             ('DDInter14','DDInter1951','issue','The text contradicts the severity', '%s', '{}', 'senior@example.org', 'senior', '2026-10-16T05:23:00Z');
            """.formatted(WA.hash(), "0".repeat(64), AW.hash(), AW.hash()));
    }

    @Autowired PairReviewReader reader;

    private Map<String, PairReviewRule.PublicReview> read(List<Pair> pairs) {
        return reader.forCodes(PublicPairReviews.codes(pairs), null).map(d -> PublicPairReviews.of(pairs, d)).block();
    }

    @Test void eachStateHasItsPublicForm() {
        Map<String, PairReviewRule.PublicReview> m = read(List.of(WA, WC, AW, WH));
        assertThat(m).containsOnlyKeys(WA.key(), WC.key(), AW.key(), WH.key());
        assertThat(m.get(WA.key())).isEqualTo(new PairReviewRule.PublicReview("reviewed", Instant.parse("2026-10-16T05:20:00Z")));
        assertThat(m.get(WC.key())).as("reviewed, then DDInter changed it: changed").isEqualTo(PublicPairReviews.NONE);
        assertThat(m.get(AW.key())).as("reviewed, then a pair issue: issue").isEqualTo(PublicPairReviews.NONE);
        assertThat(m.get(WH.key())).as("never reviewed").isEqualTo(PublicPairReviews.NONE);
    }

    @Test void noViewerMeansNothingIsMine() {
        assertThat(reader.forCodes(PublicPairReviews.codes(List.of(WA, AW)), null).block().values().stream()
            .flatMap(List::stream)).noneMatch(PairReviewRule.Decision::mine);
    }

    @Test void noPairsNoRows() {
        assertThat(read(List.of())).isEmpty();
    }
}
