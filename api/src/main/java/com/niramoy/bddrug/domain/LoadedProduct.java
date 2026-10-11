package com.niramoy.bddrug.domain;

/** One entry of the light product list used by the interaction checker's picker. */
public record LoadedProduct(String conceptId, String tradeName, String dosageForm) {}
