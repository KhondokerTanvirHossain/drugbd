package com.niramoy.bddrug;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * §7.4.1 (D74), §11.3: the services decide from the public label only, never from the internal review status, and the
 * switch has one reader. A class under application/ that compares reviewStatus() with "ok", or any class but PublicMode
 * and PublicModeConfig that reads PUBLIC_SHOWS_UNREVIEWED or bddrug.public-shows-unreviewed, fails this test.
 */
class PublicModeGuardTest {
    static final Path MAIN = Path.of("src/main/java/com/niramoy/bddrug");
    static final Set<String> SWITCH_READERS = Set.of("PublicMode.java", "PublicModeConfig.java");

    static boolean comparesStatusWithOk(String source) {
        return source.matches("(?s).*\"ok\"\\s*\\.equals\\([^)]*reviewStatus\\(\\)\\).*")
               || source.matches("(?s).*reviewStatus\\(\\)\\s*\\.equals\\(\\s*\"ok\"\\s*\\).*");
    }

    static boolean readsTheSwitch(String source) {
        return source.contains("PUBLIC_SHOWS_UNREVIEWED") || source.contains("public-shows-unreviewed");
    }

    private static List<Path> sources(Path dir) throws IOException {
        try (Stream<Path> files = Files.walk(dir)) { return files.filter(p -> p.toString().endsWith(".java")).sorted().toList(); }
    }

    @Test void servicesNeverDecideFromTheInternalStatus() throws IOException {
        List<String> offenders = new ArrayList<>();
        for (Path f : sources(MAIN.resolve("application"))) if (comparesStatusWithOk(Files.readString(f))) offenders.add(f.toString());
        assertThat(offenders).isEmpty();
    }

    @Test void theSwitchHasOneReader() throws IOException {
        List<String> readers = new ArrayList<>();
        for (Path f : sources(MAIN)) if (readsTheSwitch(Files.readString(f))) readers.add(f.getFileName().toString());
        assertThat(readers).isNotEmpty().allMatch(SWITCH_READERS::contains);
        assertThat(readers).contains("PublicModeConfig.java");
    }

    @Test void theGuardCatchesBoth() {
        assertThat(comparesStatusWithOk("if (!\"ok\".equals(p.reviewStatus())) return stub;")).isTrue();
        assertThat(comparesStatusWithOk("if (p.reviewStatus().equals(\"ok\")) {")).isTrue();
        assertThat(comparesStatusWithOk("if (p.review() == null) return stub;")).isFalse();
        assertThat(readsTheSwitch("System.getenv(\"PUBLIC_SHOWS_UNREVIEWED\")")).isTrue();
        assertThat(readsTheSwitch("@Value(\"${bddrug.public-shows-unreviewed:}\")")).isTrue();
    }
}
