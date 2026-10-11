package com.niramoy.bddrug.domain;
import java.util.List;
public record InteractionAlert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                               boolean routeAssumed, String source) {
    /** A DDInter placeholder ("None", "-", blank) is no text: null, never shown as if it were advice. */
    public InteractionAlert {
        interaction = DdinterText.clean(interaction);
        management = DdinterText.clean(management);
    }

    public record Side(String conceptId, String bdsId, String name) {}
}
