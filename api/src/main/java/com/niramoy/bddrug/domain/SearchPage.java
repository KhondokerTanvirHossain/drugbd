package com.niramoy.bddrug.domain;

/** One page of search results across three ordered groups: substances, approved products, stubs (§6.3). Pure. */
public final class SearchPage {
    private SearchPage() {}
    public record Slice(int offset, int limit) { public static final Slice NONE = new Slice(0, 0); }
    public record Plan(Slice substances, Slice approved, Slice stubs) {}

    public static Plan plan(long substances, long approved, long stubs, int offset, int size) {
        long end = (long) offset + size;
        return new Plan(slice(0, substances, offset, end), slice(substances, approved, offset, end),
            slice(substances + approved, stubs, offset, end));
    }

    private static Slice slice(long start, long length, long from, long to) {
        long a = Math.max(from, start), b = Math.min(to, start + length);
        return b > a ? new Slice((int) (a - start), (int) (b - a)) : Slice.NONE;
    }
}
