package com.niramoy.bddrug.domain;

/** Which records a read may see: PUBLIC (anonymous visitors, approved records only) or ALL (reviewers, internal token). */
public enum Scope { PUBLIC, ALL }
