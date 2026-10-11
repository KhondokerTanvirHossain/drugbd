package com.niramoy.bddrug.application;
public class ConflictException extends RuntimeException {
    private final String field;
    public ConflictException(String field, String message) { super(message); this.field = field; }
    public String field() { return field; }
}
