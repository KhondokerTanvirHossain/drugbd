package com.niramoy.bddrug;

import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.presentation.ApiExceptionHandler;
import com.niramoy.bddrug.presentation.BatchController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.WebFluxTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.core.publisher.Flux;
import static org.mockito.Mockito.when;

@WebFluxTest(BatchController.class)
@Import(ApiExceptionHandler.class)
class ApiExceptionHandlerTest {
    @Autowired WebTestClient web;
    @MockitoBean BatchQueryPort batches;

    @Test void unexpectedErrorUsesEnvelope() {
        when(batches.list()).thenReturn(Flux.error(new RuntimeException("boom")));
        web.get().uri("/v1/batches").exchange()
            .expectStatus().isEqualTo(500)
            .expectBody()
            .jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("INTERNAL_ERROR")
            .jsonPath("$.message").isEqualTo("Unexpected error");
    }
}
