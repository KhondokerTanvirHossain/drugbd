package com.niramoy.bddrug;

import com.niramoy.bddrug.domain.PublicMode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.ConfigurableApplicationContext;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** §7.4.1 (D74), as InternalTokenStartupTest: an invalid switch value stops the API; unset starts approved-only and logs it. */
@ExtendWith(OutputCaptureExtension.class)
class PublicModeStartupTest {
    private static final String[] BASE = {
        "--server.port=0", "--spring.r2dbc.url=r2dbc:postgresql://localhost:1/none", "--management.server.port=0",
        "--bddrug.internal-api-token=" + "z".repeat(40)};

    private static ConfigurableApplicationContext start(String... extra) {
        String[] args = new String[BASE.length + extra.length];
        System.arraycopy(BASE, 0, args, 0, BASE.length);
        System.arraycopy(extra, 0, args, BASE.length, extra.length);
        return SpringApplication.run(BddrugApiApplication.class, args);
    }

    @Test void anInvalidValueStopsStartup() {
        assertThatThrownBy(() -> start("--bddrug.public-shows-unreviewed=ture"))
            .hasRootCauseInstanceOf(IllegalStateException.class)
            .rootCause().hasMessage("PUBLIC_SHOWS_UNREVIEWED must be true or false");
    }

    @Test void unsetStartsApprovedOnlyAndLogsIt(CapturedOutput out) {
        try (ConfigurableApplicationContext ctx = start("--bddrug.public-shows-unreviewed=")) {
            assertThat(ctx.getBean(PublicMode.class)).isEqualTo(PublicMode.APPROVED_ONLY);
        }
        assertThat(out.getAll()).contains("Public mode: approved_only");
    }

    @Test void trueStartsShowMode(CapturedOutput out) {
        try (ConfigurableApplicationContext ctx = start("--bddrug.public-shows-unreviewed=true")) {
            assertThat(ctx.getBean(PublicMode.class)).isEqualTo(PublicMode.SHOW_UNREVIEWED);
        }
        assertThat(out.getAll()).contains("Public mode: show_unreviewed");
    }
}
