package com.niramoy.bddrug.adapter.persistence;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.niramoy.bddrug.domain.PairContent;
import com.niramoy.bddrug.domain.PairReviewRule;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Every senior pair decision (ops.pair_review) among a set of DDInter entries, in one query (§7.7: no N+1). The reviewer
 * email is read only to decide {@code mine} and never leaves this method.
 */
@Component
public class PairReviewReader {
    private final DatabaseClient db;
    private final ObjectMapper json;
    public PairReviewReader(DatabaseClient db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    /** ddinter_pair stores a < b in text order; so does ops.pair_review. */
    public static String key(String a, String b) { return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a; }

    public Mono<Map<String, List<PairReviewRule.Decision>>> forCodes(Collection<String> codes, String viewerEmail) {
        if (codes.isEmpty()) return Mono.just(Map.of());
        String[] ids = codes.stream().distinct().toArray(String[]::new);
        String viewer = viewerEmail == null ? null : viewerEmail.strip();
        return db.sql("""
                SELECT id, ddinter_a, ddinter_b, decision, note, content_hash, content::text AS content, reviewer_email, decided_at
                FROM ops.pair_review WHERE ddinter_a = ANY(:ids) AND ddinter_b = ANY(:ids) ORDER BY decided_at, id""")
            .bind("ids", ids)
            .map(r -> Map.entry(r.get("ddinter_a", String.class) + "|" + r.get("ddinter_b", String.class),
                new PairReviewRule.Decision(r.get("id", Long.class), r.get("decision", String.class), r.get("note", String.class),
                    r.get("content_hash", String.class), content(r.get("content", String.class)),
                    r.get("decided_at", OffsetDateTime.class).toInstant(),
                    viewer != null && viewer.equalsIgnoreCase(r.get("reviewer_email", String.class)))))
            .all()
            .collect(HashMap<String, List<PairReviewRule.Decision>>::new,
                (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()))
            .map(m -> (Map<String, List<PairReviewRule.Decision>>) m);
    }

    /** The content as reviewed ({"severity", "actions", "interaction", "management"}); null when unreadable. */
    PairContent.Content content(String text) {
        try {
            JsonNode n = json.readTree(text);
            List<String> actions = new ArrayList<>();
            n.path("actions").forEach(a -> actions.add(a.asText()));
            return new PairContent.Content(n.path("severity").asText(null), actions,
                n.path("interaction").isTextual() ? n.get("interaction").asText() : null,
                n.path("management").isTextual() ? n.get("management").asText() : null);
        } catch (Exception e) {
            return null;
        }
    }
}
