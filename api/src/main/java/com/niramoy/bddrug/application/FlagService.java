package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.FlagPort;
import com.niramoy.bddrug.domain.Flag;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.Set;

@Service
public class FlagService {
    public static final Set<String> TARGET_TYPES = Set.of("product", "substance", "batch_item", "check", "other");
    public static final Set<String> STATUSES = Set.of("open", "resolved");
    public static final int MESSAGE_MIN = 5, MESSAGE_MAX = 2000, TARGET_ID_MAX = 200;

    private final FlagPort port;
    public FlagService(FlagPort port) { this.port = port; }

    public record Request(String targetType, String targetId, String message, String reporterEmail) {}

    public Mono<Flag> create(Request r) {
        return Mono.fromCallable(() -> {
            String type = Validate.oneOf(r.targetType(), TARGET_TYPES, "targetType");
            String target = Validate.text(r.targetId(), 1, TARGET_ID_MAX, "targetId");
            String message = Validate.text(r.message(), MESSAGE_MIN, MESSAGE_MAX, "message");
            String email = Validate.email(r.reporterEmail(), "reporterEmail");
            return new Request(type, target, message, email);
        }).flatMap(v -> port.create(v.targetType(), v.targetId(), v.message(), v.reporterEmail()));
    }

    public Flux<Flag> list(String status) {
        return Mono.fromCallable(() -> Validate.oneOf(status, STATUSES, "status")).flatMapMany(port::list);
    }

    public Mono<Flag> resolve(long id, String resolvedBy) {
        return Mono.fromCallable(() -> Validate.email(resolvedBy, "resolvedBy")).flatMap(by -> port.resolve(id, by));
    }
}
