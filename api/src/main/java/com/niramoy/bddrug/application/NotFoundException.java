package com.niramoy.bddrug.application;
public class NotFoundException extends RuntimeException {
    private final String field;
    public NotFoundException(String field, String message) { super(message); this.field = field; }
    public String field() { return field; }
}
