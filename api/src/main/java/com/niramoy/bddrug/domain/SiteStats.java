package com.niramoy.bddrug.domain;
import java.util.List;

/**
 * GET /v1/stats (spec §7.4): public counts, and per batch each record's trade name, public status and whether Learn may
 * still show its frozen example (§6.8), and the public mode (§7.4.1). Deliberately coarse (D43): no note, role, time, reason, email or clinical value.
 */
public record SiteStats(String publicMode, int registerProducts, long productsLoaded, long substances, long approvedProducts,
                        long inReviewProducts, List<BatchStats> batches) {
    /** Products in the official DGDA register (source date 27/03/2026; spec §6.1 stats band). */
    public static final int REGISTER_PRODUCTS = 39196;
    public static final String APPROVED = "approved", NOT_REVIEWED = "not_reviewed";

    /** {@code itemCount} and {@code approved} count the items still in the batch file; {@code items} also lists removed ones. */
    public record BatchStats(String batchId, String status, int itemCount, int approved, List<ItemStats> items) {}

    /**
     * {@code status}: "approved" when the product is approved now (in both modes), otherwise "not_reviewed". {@code hidden}:
     * the product is not visible on the public site under the mode; {@code review}: its public label, null when hidden
     * (§7.4.1, D74). Coarse, like exampleUsable (D43).
     */
    public record ItemStats(String conceptId, String tradeName, String status, boolean exampleUsable, boolean hidden, String review) {}
}
