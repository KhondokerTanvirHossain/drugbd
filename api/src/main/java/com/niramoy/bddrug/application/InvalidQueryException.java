package com.niramoy.bddrug.application;
public class InvalidQueryException extends RuntimeException {
    private final String field;
    public InvalidQueryException(String message) { this("q", message); }
    public InvalidQueryException(String field, String message) { super(message); this.field = field; }
    public String field() { return field; }
}
