package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * One DDInter alert of the checker. P1C adds the pair's entries and its coarse public review state (§7.4, D53): every
 * alert is returned with its DDInter text whatever its senior-review state; senior review is never a gate.
 */
public record InteractionAlert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                               boolean routeAssumed, String source, String ddinterA, String ddinterB,
                               PairReviewRule.PublicReview pairReview) {
    /** A DDInter placeholder ("None", "-", blank) is no text: null, never shown as if it were advice. */
    public InteractionAlert {
        interaction = DdinterText.clean(interaction);
        management = DdinterText.clean(management);
    }

    public InteractionAlert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                            boolean routeAssumed, String source) {
        this(severity, a, b, actions, interaction, management, routeAssumed, source, null, null, null);
    }

    public record Side(String conceptId, String bdsId, String name) {}
}
