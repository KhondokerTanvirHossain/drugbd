package com.niramoy.bddrug;
import com.niramoy.bddrug.domain.PublicMode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The one reader of PUBLIC_SHOWS_UNREVIEWED (spec §7.4.1, D74): bound as bddrug.public-shows-unreviewed and read once at
 * start into the PublicMode bean that every public adapter and service takes. An invalid value stops the API, as
 * InternalAuth does for the token. PublicModeGuardTest keeps every other class from reading the property.
 */
@Configuration
public class PublicModeConfig {
    private static final Logger LOG = LoggerFactory.getLogger(PublicModeConfig.class);

    @Bean
    public PublicMode publicMode(@Value("${bddrug.public-shows-unreviewed:}") String setting) {
        PublicMode mode = PublicMode.fromSetting(setting);
        LOG.info("Public mode: {}", mode.wire());
        return mode;
    }
}
