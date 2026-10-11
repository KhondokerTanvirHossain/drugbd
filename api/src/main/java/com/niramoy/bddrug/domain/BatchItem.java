package com.niramoy.bddrug.domain;
import java.util.List;
public record BatchItem(String conceptId, String review, String note, Product extracted, String sourceJson,
                        List<StageResult> stages) {}
