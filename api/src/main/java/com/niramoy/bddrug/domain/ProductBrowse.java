package com.niramoy.bddrug.domain;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

/**
 * §6.11.3 P17 {@code GET /v1/products/browse} (D75): one page of the A–Z list of visible products (public label not null
 * under the public mode, §7.4.1), 50 a page, sorted by lower(trade_name), trade_name, concept_id. {@code letter} is the
 * chosen first letter ({@code A}–{@code Z} or {@value #DIGITS}), null for all; {@code total} counts the visible products of
 * that letter (or of all letters); {@code letters} always holds the 27 keys of {@link #KEYS} with their counts, zeros
 * included. A product's key is the upper-case first character of its trade name when that is a letter A–Z, otherwise
 * {@value #DIGITS}. Pure.
 */
public record ProductBrowse(String letter, long total, int page, boolean hasMore, List<LetterCount> letters, List<Row> products) {
    /** The key of every trade name whose first character is not a letter A–Z. */
    public static final String DIGITS = "0-9";
    /** The 27 keys in their order: A…Z, then 0-9. */
    public static final List<String> KEYS = keys();

    public record LetterCount(String letter, long count) {}

    /** A listed product: the §6.3 product hit without the match fields; status is approved or not_reviewed by approval. */
    public record Row(String conceptId, String tradeName, String darNumber, String company, String dosageForm, String genericContentRaw,
                      SearchResult.ClinicalRef clinicalDrug, String status, String review) {}

    private static List<String> keys() {
        List<String> out = new ArrayList<>(IntStream.rangeClosed('A', 'Z').mapToObj(c -> String.valueOf((char) c)).toList());
        out.add(DIGITS);
        return List.copyOf(out);
    }

    /**
     * The key a {@code letter} parameter names: a single ASCII letter in either case (upper-cased) or {@value #DIGITS};
     * null for anything else, so the caller decides what an unknown value means.
     */
    public static String key(String letter) {
        if (letter == null) return null;
        if (DIGITS.equals(letter)) return DIGITS;
        if (letter.length() != 1) return null;
        char c = letter.charAt(0);
        if (c >= 'a' && c <= 'z') return String.valueOf((char) (c - 'a' + 'A'));
        return c >= 'A' && c <= 'Z' ? letter : null;
    }

    /**
     * One page from the visible counts per key ({@code counts}, a key with no visible product may be absent) and the page's
     * rows: every key of {@link #KEYS} listed, the total of {@code letter} (all keys when null), and whether a page follows.
     */
    public static ProductBrowse assemble(String letter, int page, int pageSize, Map<String, Long> counts, List<Row> products) {
        List<LetterCount> letters = KEYS.stream().map(k -> new LetterCount(k, counts.getOrDefault(k, 0L))).toList();
        long total = letter == null ? letters.stream().mapToLong(LetterCount::count).sum() : counts.getOrDefault(letter, 0L);
        return new ProductBrowse(letter, total, page, (long) (page + 1) * pageSize < total, letters, List.copyOf(products));
    }
}
