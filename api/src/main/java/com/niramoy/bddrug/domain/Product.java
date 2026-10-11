package com.niramoy.bddrug.domain;
import java.util.List;
public record Product(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                      String genericContentRaw, String qualityFlag, List<Ingredient> ingredients) {
    public Product withIngredients(List<Ingredient> list) {
        return new Product(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, list);
    }
}
