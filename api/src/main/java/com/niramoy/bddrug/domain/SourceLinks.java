package com.niramoy.bddrug.domain;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Spec §5.6.6: the only place a source URL is built. A code is checked against its system's pattern first; a code that
 * fails gets no link (it is still shown). {@code fetchedAt} is the stored fetch time, or null when none is stored
 * ("fetched on" is never shown without one). Nothing here calls a site: CI asserts the hrefs only.
 */
public final class SourceLinks {
    private SourceLinks() {}

    public record Source(String url, String label, Instant fetchedAt) {}

    public static final String OCL_CONCEPT = "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/";
    static final String ICD11_HOME = "https://icd.who.int/browse/latest-release/mms/en";

    private record Rule(Pattern pattern, String url, String label) {}

    private static final Map<String, Rule> RULES = Map.of(
        "RXCUI", new Rule(Pattern.compile("^[0-9]{1,10}$"),
            "https://mor.nlm.nih.gov/RxNav/search?searchBy=RXCUI&searchTerm={c}", "RxNav"),
        "ATC", new Rule(Pattern.compile("^[A-Z][0-9]{2}([A-Z]([A-Z]([0-9]{2})?)?)?$"),
            "https://atcddd.fhi.no/atc_ddd_index/?code={c}&showdescription=no", "WHO ATC/DDD Index"),
        "DRUGBANK", new Rule(Pattern.compile("^DB[0-9]{5}$"), "https://go.drugbank.com/drugs/{c}", "DrugBank"),
        "SNOMEDCT", new Rule(Pattern.compile("^[0-9]{6,18}$"),
            "https://mor.nlm.nih.gov/RxNav/search?searchBy=SNOMEDCT&searchTerm={c}", "RxNav (SNOMED CT search)"),
        "ICD11_XM", new Rule(Pattern.compile("^XM[0-9A-Z]{4}$"), ICD11_HOME, "Search ICD-11 for {c}"),
        "DDINTER", new Rule(Pattern.compile("^DDInter[0-9]{1,6}$"),
            "https://ddinter2.scbdd.com/server/drug-detail/{c}/", "DDInter 2.0"));
    private static final Pattern INTERACTION_ID = Pattern.compile("^[0-9]{1,9}$");

    /** The link for one code of a substance, or empty when the system has no rule or the code fails its pattern. */
    public static Optional<Source> code(String system, String code, Instant fetchedAt) {
        Rule rule = RULES.get(system);
        if (rule == null || code == null || !rule.pattern().matcher(code).matches()) return Optional.empty();
        String c = URLEncoder.encode(code, StandardCharsets.UTF_8);
        return Optional.of(new Source(rule.url().replace("{c}", c), rule.label().replace("{c}", code), fetchedAt));
    }

    /** The DDInter pair page, only for a stored numeric interaction_id; no per-pair fetch time is stored. */
    public static Optional<Source> pair(String interactionId) {
        if (interactionId == null || !INTERACTION_ID.matcher(interactionId).matches()) return Optional.empty();
        return Optional.of(new Source("https://ddinter2.scbdd.com/server/interact/" + interactionId + "/", "Full record in DDInter 2.0", null));
    }

    /** The DGDA register (OCL) page of a brand: the existing S-key target (§5.14). */
    public static Source brand(String conceptId, Instant fetchedAt) {
        return new Source(oclUrl(conceptId), "DGDA register (OCL)", fetchedAt);
    }

    /**
     * The OCL concept URL, as web/lib/evidence.ts builds it with encodeURIComponent. URLEncoder escapes five characters
     * that encodeURIComponent keeps (! ' ( ) ~) and writes a space as "+", so both are undone here.
     */
    public static String oclUrl(String conceptId) {
        String encoded = URLEncoder.encode(conceptId, StandardCharsets.UTF_8).replace("+", "%20")
            .replace("%21", "!").replace("%27", "'").replace("%28", "(").replace("%29", ")").replace("%7E", "~");
        return OCL_CONCEPT + encoded + "/";
    }
}
