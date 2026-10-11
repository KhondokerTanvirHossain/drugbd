package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.InvalidQueryException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebInputException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(InvalidQueryException.class)
    ResponseEntity<ApiResponse<Void>> invalid(InvalidQueryException e) {
        return ResponseEntity.badRequest().body(ApiResponse.error("INVALID_QUERY", "q", e.getMessage()));
    }
    @ExceptionHandler(ServerWebInputException.class)
    ResponseEntity<ApiResponse<Void>> badInput(ServerWebInputException e) {
        return ResponseEntity.badRequest().body(ApiResponse.error("INVALID_QUERY", null, "Invalid request parameter"));
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiResponse<Void>> status(ResponseStatusException e) {
        String code = e.getStatusCode().value() == 404 ? "NOT_FOUND" : "ERROR";
        return ResponseEntity.status(e.getStatusCode()).body(ApiResponse.error(code, null, e.getReason()));
    }
}
