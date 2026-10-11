package com.niramoy.bddrug.presentation;

/** A request that needs the internal token came without it, or with a wrong one. */
public class UnauthorizedException extends RuntimeException {
    public UnauthorizedException() { super("Missing or invalid internal token", null, false, false); }
}
