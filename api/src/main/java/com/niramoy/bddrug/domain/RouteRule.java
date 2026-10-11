package com.niramoy.bddrug.domain;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/**
 * Which DDInter entries speak for a substance in a product.
 * Use the entries whose route_scope equals the product's clinical-drug route. Otherwise use the
 * 'systemic' or 'any' entries and mark the route as assumed. No usable entry means no interaction data.
 */
public final class RouteRule {
    private RouteRule() {}

    public record Choice(List<DdinterCode> codes, boolean routeAssumed) {}

    public static Optional<Choice> choose(Collection<DdinterCode> codes, String route) {
        if (route != null) {
            List<DdinterCode> exact = sorted(codes.stream().filter(c -> route.equals(c.routeScope())).toList());
            if (!exact.isEmpty()) return Optional.of(new Choice(exact, false));
        }
        List<DdinterCode> general = sorted(codes.stream()
            .filter(c -> "systemic".equals(c.routeScope()) || "any".equals(c.routeScope())).toList());
        return general.isEmpty() ? Optional.empty() : Optional.of(new Choice(general, true));
    }

    private static List<DdinterCode> sorted(List<DdinterCode> codes) {
        return codes.stream().filter(Objects::nonNull)
            .sorted(Comparator.comparing(DdinterCode::code, DdinterCode.ID_ORDER)).toList();
    }
}
