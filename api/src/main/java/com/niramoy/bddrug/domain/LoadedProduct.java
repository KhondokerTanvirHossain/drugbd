package com.niramoy.bddrug.domain;

/** One entry of the light product list used by the interaction checker's picker; review: its public label (§7.4.1), null when hidden. */
public record LoadedProduct(String conceptId, String tradeName, String dosageForm, String review) {}
