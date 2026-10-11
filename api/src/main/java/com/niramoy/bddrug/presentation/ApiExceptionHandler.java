package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.NotFoundException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebInputException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(InvalidQueryException.class)
    ResponseEntity<ApiResponse<Void>> invalid(InvalidQueryException e) {
        return ResponseEntity.badRequest().body(ApiResponse.error("INVALID_QUERY", e.field(), e.getMessage()));
    }
    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiResponse<Void>> notFound(NotFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResponse.error("NOT_FOUND", e.field(), e.getMessage()));
    }
    @ExceptionHandler(ServerWebInputException.class)
    ResponseEntity<ApiResponse<Void>> badInput(ServerWebInputException e) {
        return ResponseEntity.badRequest().body(ApiResponse.error("INVALID_QUERY", null, "Invalid request parameter"));
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiResponse<Void>> status(ResponseStatusException e) {
        String code = e.getStatusCode().value() == 404 ? "NOT_FOUND" : "ERROR";
        String reason = e.getReason() != null ? e.getReason()
            : (e.getStatusCode() instanceof HttpStatus hs ? hs.getReasonPhrase() : "Error");
        return ResponseEntity.status(e.getStatusCode()).body(ApiResponse.error(code, null, reason));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiResponse<Void>> unexpected(Exception e) {
        log.error("Unhandled exception: {}: {}", e.getClass().getName(), e.getMessage());
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ApiResponse.error("INTERNAL_ERROR", null, "Unexpected error"));
    }
}
