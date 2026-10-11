package com.niramoy.bddrug.domain;
public record BatchItem(String conceptId, String review, String note, Product extracted, String sourceJson) {}
