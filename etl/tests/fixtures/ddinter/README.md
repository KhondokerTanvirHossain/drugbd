# DDInter fixtures

Captured 2026-10-11 from https://ddinter2.scbdd.com, politely (<= 1 request/s, User-Agent `bddrug-etl/0.2 (+niramoy)`).
DDInter content is used under the owner's agreement.

Trimmed for size; the content is otherwise unmodified:
- `detail_*.html`, `interaction_3039.html`: `<script>`, `<style>` and `<svg>` bodies removed.
- `drug_list_p1.json`: first 5 drugs (length=5); the `structure` SVG field removed. `recordsTotal` is the real total (2290).
- `graph_1951.json`: 5 of 934 interactions (including Acalabrutinib DDInter9 and Acetylsalicylic acid DDInter20).
- `interact_with_p1.json` / `_p2.json`: a few rows from `start=0` and `start=500` of `interact-with/DDInter1951` (real `recordsTotal` 936). Page 1 holds Acalabrutinib (3039) and Acetylsalicylic acid (34056) among its rows.
- `disease_1951.json`, `food_1951.json`: first 2 rows each.

Live findings (2026-10-11): `GET /server/drug/` sets no cookie; the CSRF token is in the page JS
(`csrfmiddlewaretoken: '...'`). The `search[value]` parameter of `interact-with` is ignored server-side
(always returns all 936 rows), so the client pages through and filters by `drug_id`.
