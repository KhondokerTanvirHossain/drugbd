package com.niramoy.bddrug.domain;

/** source is where the code came from (dgda-ocl, rxnav, ddinter2); sourceLink is its public page (§5.6.6), null when the code fails its pattern. */
public record SubstanceCode(String system, String code, String routeScope, String source, String method, double confidence,
                            SourceLinks.Source sourceLink) {}
