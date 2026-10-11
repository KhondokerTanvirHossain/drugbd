package com.niramoy.bddrug.presentation;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
public record ApiResponse<T>(boolean success, T data, String message, List<ApiError> errors, Metadata metadata) {
    public record ApiError(String field, String code, String message) {}
    public record Metadata(Instant timestamp, String requestId) {}
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, "OK", List.of(), new Metadata(Instant.now(), UUID.randomUUID().toString()));
    }
    public static ApiResponse<Void> error(String code, String field, String message) {
        return new ApiResponse<>(false, null, message, List.of(new ApiError(field, code, message)),
            new Metadata(Instant.now(), UUID.randomUUID().toString()));
    }
}
