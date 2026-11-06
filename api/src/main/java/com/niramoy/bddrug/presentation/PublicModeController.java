package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.domain.PublicMode;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/**
 * GET /v1/public-mode (spec §7.4.1, D74): which records the public site shows, approved_only or show_unreviewed. A public
 * read like /v1/stats: no token needed (a present one must still match), any scope ignored, no-store. The answer is the
 * PublicMode bean read at start; there is no database read and no way to change it here.
 */
@RestController
@RequestMapping("/v1/public-mode")
public class PublicModeController {
    public record Mode(String mode) {}

    private final PublicMode mode;
    private final InternalAuth auth;
    public PublicModeController(PublicMode mode, InternalAuth auth) {
        this.mode = mode;
        this.auth = auth;
    }

    @GetMapping
    public Mono<ResponseEntity<ApiResponse<Mode>>> get(@RequestHeader(value = InternalAuth.HEADER, required = false) String token) {
        auth.present(token);
        return Mono.just(ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.ok(new Mode(mode.wire()))));
    }
}
