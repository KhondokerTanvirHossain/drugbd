package com.niramoy.bddrug.domain;
import java.util.List;
public record InteractionAlert(String severity, Side a, Side b, List<String> actions, String interaction, String management,
                               boolean routeAssumed, String source) {
    public record Side(String conceptId, String bdsId, String name) {}
}
