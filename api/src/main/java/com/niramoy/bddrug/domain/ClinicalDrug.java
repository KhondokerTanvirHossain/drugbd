package com.niramoy.bddrug.domain;
import java.util.List;
public record ClinicalDrug(String bdcId, String displayName, String doseForm, String route, List<ClinicalIngredient> ingredients) {}
