package com.niramoy.bddrug.domain;
import com.fasterxml.jackson.annotation.JsonRawValue;

/** One pipeline stage's outcome for a batch item. {@code evidence} is the stored JSONB, served as JSON. */
public record StageResult(String stage, String status, String note, @JsonRawValue String evidence) {}
