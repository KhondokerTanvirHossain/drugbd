package com.niramoy.bddrug.domain;
import java.util.Collection;
import java.util.Locale;

/** The spelling suggestion's distance (§7.4 "Suggestion"): optimal string alignment, case-insensitive. Pure. */
public final class Suggest {
    private Suggest() {}
    public static final int MAX_DISTANCE = 2;

    public static int distance(String a, String b) {
        int n = a.length(), m = b.length();
        int[][] d = new int[n + 1][m + 1];
        for (int i = 0; i <= n; i++) d[i][0] = i;
        for (int j = 0; j <= m; j++) d[0][j] = j;
        for (int i = 1; i <= n; i++)
            for (int j = 1; j <= m; j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1))
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        return d[n][m];
    }

    /** The single closest name at distance 1 or 2; ties by distance, then name; null when none. */
    public static String closest(String term, Collection<String> names) {
        String t = term.toLowerCase(Locale.ROOT);
        String best = null;
        int bestD = MAX_DISTANCE + 1;
        for (String name : names) {
            String l = name.toLowerCase(Locale.ROOT);
            if (l.equals(t) || Math.abs(l.length() - t.length()) > MAX_DISTANCE) continue;
            int d = distance(t, l);
            if (d <= MAX_DISTANCE && (d < bestD || (d == bestD && name.compareToIgnoreCase(best) < 0))) {
                best = name;
                bestD = d;
            }
        }
        return best;
    }
}
