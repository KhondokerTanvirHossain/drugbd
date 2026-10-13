"""DDInter stage: map substances to DDInter entries (route-aware, confirmed by DrugBank ID),
store pairs, diseases, foods, interaction texts and per-substance interaction coverage.

Client data (drug list, detail, graph, diseases, foods, texts) is fetched at most once per run and
cached in memory. The cache holds only what the client returned, never DB state, so a product whose
savepoint rolls back cannot leave a stale "already stored" belief behind: "already stored" facts
(``stored_ids`` / ``stored_texts``) are merged into the run only after the product's savepoint exits.

The run is planned once (``plan_ddinter``: drug list, scope, per-product plans for every product of
the run) and then processed product by product (``DDInterPlan.process``), so the caller may commit
between products (the pipeline commits every ``--ddinter-chunk`` products) while the caches still
cover the whole run. ``map_and_load_ddinter`` plans and processes everything without committing.
A product's "already stored" facts are merged when its savepoint exits; if the caller then rolls the
enclosing transaction back, it must stop using the plan (the pipeline aborts the stage).

Interaction texts are fetched for every pair whose two sides are both "in scope": DDInter ids that are
candidates of this batch's substances, plus every DDInter id already mapped in ``curated.substance_code``
by earlier batches. A later batch normally holds only new products, so without the stored ids a pair
split across batches (warfarin in 0001, an NSAID in 0002) would never get its text. Fetches stay bounded
to pairs between drugs we have mapped.
Route scope (spec §8.1): each product is checked against the entries the route rule (``choose``, the twin of the API's
RouteRule) picks for its clinical drug's route. ``pair_count`` counts those entries' pairs, ``text_missing`` lists a pair
only when one side is chosen by this product and the other by an in-scope product, and the route notes ("DDInter route
assumed: …", "No DDInter entry for route …") explain an assumed or missing route. Mapping, coverage and the stored
DDInter rows still cover every candidate entry: they are shared substance facts.

DDInter free text (interaction, management, disease text, food description and management) goes through
``clean_text``: a placeholder ("None", "-", empty, ...) is stored as NULL, never as text. A pair whose interaction
AND management are both missing gets no text row and is reported as ``text_missing``, like a pair without a text.
A text row stored before this rule, with a placeholder in a field, counts as not stored: the next run re-fetches
it and replaces it, or deletes it when DDInter still has neither text (idempotent, no migration needed).

Everything this stage writes is shared: substance-level rows (DDInter mappings, names, coverage) by
``bds_id`` and DDInter rows (drug, pairs, texts, diseases, foods) by DDInter id, shown by every product
with that substance. Each write reports whether it really inserted or changed a row (an identical re-run
reports nothing) into the product's ``_Pending.changed``, merged into the caller's ``SharedChanges`` only
when the product's savepoint commits; the pipeline then re-opens the other products that show them.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import TypeVar

import psycopg

from bddrug_etl.ddinter.client import DDInterClient, InteractWithList
from bddrug_etl.ddinter.html import PLACEHOLDERS, DDInterDrug, InteractionText, clean_text
from bddrug_etl.parse.names import normalize_name
from bddrug_etl.stages.results import SharedChanges, StageResult, error_note

SOURCE = "ddinter2"
NONE_NOTE = "No interaction data in DDInter for this substance"
INCOMPLETE_NOTE = "DDInter pair list incomplete for {}"
_ROUTE_SUFFIX = re.compile(r"^(?P<base>.*?)\s*\((?P<route>ophthalmic|otic|nasal|topical)\)\s*$", re.IGNORECASE)
_SEVERITIES = frozenset({"major", "moderate", "minor", "unknown"})
_NAME_TYPES = ("icd11", "rxnorm", "dgda_content")
GENERAL_SCOPES = ("systemic", "any")
E = TypeVar("E")


def route_assumed_note(ddinter_id: str, scope: str, route: str | None) -> str:
    """§8.1 item 3: the general entry stands in for the product's route (NULL route: "unknown route", never None)."""
    return f"DDInter route assumed: {ddinter_id} ({scope}) used for {route if route is not None else 'unknown route'}"


def no_route_entry_note(route: str | None) -> str:
    """§8.1 item 3: the substance has DDInter entries, but none for this route and no general one."""
    return f"No DDInter entry for route {route}" if route is not None else "No DDInter entry for unknown route"


def choose(entries: Iterable[E], route: str | None) -> tuple[list[E], bool]:
    """Which DDInter entries speak for a substance in a product: the Python twin of the API's ``RouteRule.choose``.

    Entries whose ``route_scope`` equals the product's route (not assumed); otherwise the ``systemic`` or ``any``
    entries (assumed); otherwise none. A NULL route never matches exactly. Sorted by the numeric part of the id.
    Works on any objects with ``ddinter_id`` and ``route_scope`` attributes.
    """
    items = list(entries)
    by_id = lambda e: _idkey(e.ddinter_id)  # noqa: E731
    if route is not None:
        exact = sorted((e for e in items if e.route_scope == route), key=by_id)
        if exact:
            return exact, False
    general = sorted((e for e in items if e.route_scope in GENERAL_SCOPES), key=by_id)
    return (general, True) if general else ([], False)


def _applies(pair: Pair, chosen_ids: set[str], scope_chosen: set[str]) -> bool:
    """§8.1 item 3: a missing text concerns this product only when one side is an entry it chose and the other side
    is an entry chosen by an in-scope product (this run, or a product mapped by an earlier batch, by its own route)."""
    a, b = pair
    return (a in chosen_ids and b in scope_chosen) or (b in chosen_ids and a in scope_chosen)


def _placeholder_sql(col: str) -> str:
    """SQL: the column holds a placeholder (NULL counts as missing too). Same list as ``clean_text``."""
    values = ", ".join(f"'{v}'" for v in sorted(PLACEHOLDERS))
    return f"(lower(regexp_replace({col}, '^\\s+|\\s+$', '', 'g')) IN ({values}))"


# A stored text row counts only if it has at least one real text and no placeholder left in either field.
_TEXT_ROW_CLEAN = (f"(t.interaction IS NOT NULL OR t.management IS NOT NULL)"
                   f" AND NOT coalesce({_placeholder_sql('t.interaction')}, false)"
                   f" AND NOT coalesce({_placeholder_sql('t.management')}, false)")
_TEXT_ROW_EMPTY = (f"coalesce({_placeholder_sql('t.interaction')}, true)"
                   f" AND coalesce({_placeholder_sql('t.management')}, true)")

Pair = tuple[str, str]  # (ddinter_a, ddinter_b) with a < b in text order


@dataclass(frozen=True)
class _Entry:
    ddinter_id: str
    name: str
    route_scope: str


@dataclass(frozen=True)
class _Sub:
    bds_id: str
    keys: frozenset[str]  # normalized icd11 / rxnorm / dgda_content names
    drugbank: frozenset[str]


@dataclass(frozen=True)
class _ProductPlan:
    route: str | None  # the clinical drug's route; None when the product has no clinical drug
    subs: list[_Sub]


@dataclass
class _Pending:
    """What one product's savepoint wrote; merged into the run only if the savepoint commits."""
    ids: set[str] = field(default_factory=set)
    texts: set[Pair] = field(default_factory=set)
    changed: SharedChanges = field(default_factory=SharedChanges)  # shared rows really inserted or changed


PairData = tuple[str, str, str, list[str]]  # (name_a, name_b, severity, actions)


@dataclass(frozen=True)
class _PairList:
    """An entry's full pair list (§8.1 item 5).

    ``graph``: rows of the graph endpoint; they carry actions and are upserted. ``extra``: partners only
    ``interact-with`` lists; they are inserted with no actions and never overwrite a stored row, because the partner's
    own graph may hold that pair with actions (DDInter's lists are not symmetric). So the stored row, and the "changed"
    report that re-opens approved records, do not depend on the order in which entries are processed.

    ``dropped``: the incomplete partners (their own read failed this run) whose pairs were left out. A list that
    dropped any pair is not the entry's full list: the entry gets no new ``ddinter_drug`` row (§7.4, D41)."""
    graph: dict[Pair, PairData]
    extra: dict[Pair, PairData]
    dropped: frozenset[str] = frozenset()

    def all(self) -> dict[Pair, PairData]:
        return {**self.extra, **self.graph}


def _idkey(ddinter_id: str) -> tuple[int, str]:
    m = re.search(r"\d+", ddinter_id)
    return (int(m.group()) if m else 0, ddinter_id)


def _empty_evidence() -> dict:
    return {"mappings": [], "coverage": [], "pair_count": 0, "disease_count": 0, "food_count": 0,
            "text_fetch_count": 0, "text_missing": []}


def _fail(cid: str, note: str) -> StageResult:
    return StageResult(cid, "fail", note, _empty_evidence())


class _Run:
    def __init__(self, client: DDInterClient, drug_list: list[tuple[str, str]]):
        self.client = client
        self.by_key: dict[str, dict[str, _Entry]] = {}
        for ddinter_id, name in drug_list:
            m = _ROUTE_SUFFIX.match(name)
            base, route = (m["base"], m["route"].lower()) if m else (name, "systemic")
            key = normalize_name(base)
            if key:
                self.by_key.setdefault(key, {})[ddinter_id] = _Entry(ddinter_id, name, route)
        self.scope_ids: set[str] = set()  # DDInter ids whose pairs get texts: batch candidates + already mapped
        self.scope_chosen: set[str] = set()  # entries chosen by the route rule for some in-scope product
        self.stored_ids: set[str] = set()
        self.stored_texts: set[Pair] = set()
        self.fetched: set[Pair] = set()
        self._detail: dict[str, DDInterDrug] = {}
        self._graph: dict[str, dict[Pair, tuple[str, str, str, list[str]]]] = {}
        self.incomplete: set[str] = set()  # candidate entries whose interact-with list was not read in full
        self._listings: dict[str, InteractWithList] = {}
        self._pair_lists: dict[str, _PairList | None] = {}
        self._diseases: dict[str, dict[str, dict]] = {}
        self._foods: dict[str, dict[str, dict]] = {}
        self.texts: dict[Pair, tuple[str, InteractionText] | None] = {}  # None: neither side lists the pair

    def candidates(self, keys: frozenset[str]) -> list[_Entry]:
        found: dict[str, _Entry] = {}
        for k in keys:
            found.update(self.by_key.get(k, {}))
        return sorted(found.values(), key=lambda e: _idkey(e.ddinter_id))

    def detail(self, ddinter_id: str) -> DDInterDrug:
        if ddinter_id not in self._detail:
            self._detail[ddinter_id] = self.client.drug_detail(ddinter_id)
        return self._detail[ddinter_id]

    def pairs(self, ddinter_id: str) -> dict[Pair, tuple[str, str, str, list[str]]]:
        """pair -> (name_a, name_b, severity, actions) for every graph row of this drug."""
        if ddinter_id not in self._graph:
            me = self.detail(ddinter_id).name
            out: dict[Pair, tuple[str, str, str, list[str]]] = {}
            for r in self.client.graph(ddinter_id):
                if r.partner_id == ddinter_id:
                    continue
                sev = r.severity if r.severity in _SEVERITIES else "unknown"
                if ddinter_id < r.partner_id:
                    out[(ddinter_id, r.partner_id)] = (me, r.partner_name, sev, list(r.actions))
                else:
                    out[(r.partner_id, ddinter_id)] = (r.partner_name, me, sev, list(r.actions))
            self._graph[ddinter_id] = out
        return self._graph[ddinter_id]

    def listing(self, ddinter_id: str) -> InteractWithList:
        """The entry's interact-with list, read once per run (the client never raises for an HTTP or shape problem)."""
        if ddinter_id not in self._listings:
            self._listings[ddinter_id] = self.client.interact_with(ddinter_id)
        return self._listings[ddinter_id]

    def pair_list(self, ddinter_id: str) -> _PairList | None:
        """The entry's full pair list (§8.1 item 5): every graph pair, plus each interact-with partner the graph lacks
        (its ``drug_name``, its level's severity, no actions). None when interact-with could not be read in full.

        Pairs with an entry in ``incomplete`` are left out: no pair row of an incomplete entry is written in this run,
        not even from its partner's complete list, and no text is looked up through it (its read would fail again).
        Those partners are recorded in ``dropped``; ``incomplete`` itself is not extended, so failures do not chain."""
        if ddinter_id not in self._pair_lists:
            listed = self.listing(ddinter_id)
            if ddinter_id in self.incomplete or not listed.complete:
                self._pair_lists[ddinter_id] = None
            else:
                skip = lambda pair: pair[0] in self.incomplete or pair[1] in self.incomplete  # noqa: E731
                all_graph = self.pairs(ddinter_id)
                graph = {p: v for p, v in all_graph.items() if not skip(p)}
                dropped = {p[0] if p[1] == ddinter_id else p[1] for p in all_graph if skip(p)}
                me = self.detail(ddinter_id).name
                extra: dict[Pair, PairData] = {}
                for row in listed.rows:
                    if row.partner_id == ddinter_id:
                        continue
                    pair = (ddinter_id, row.partner_id) if ddinter_id < row.partner_id else (row.partner_id, ddinter_id)
                    if skip(pair):
                        dropped.add(row.partner_id)
                        continue
                    if pair in all_graph:
                        continue
                    sev = row.severity if row.severity in _SEVERITIES else "unknown"
                    extra.setdefault(pair, (me, row.partner_name, sev, []) if pair[0] == ddinter_id
                                     else (row.partner_name, me, sev, []))
                self._pair_lists[ddinter_id] = _PairList(graph, extra, frozenset(dropped))
        return self._pair_lists[ddinter_id]

    def missing_from(self, ddinter_id: str) -> set[str]:
        """The entries whose missing read keeps this entry's full pair list from being stored in this run: the entry
        itself when its own read is incomplete, else the incomplete partners its list dropped (empty: stored in full)."""
        listed = self.pair_list(ddinter_id)
        return {ddinter_id} if listed is None else set(listed.dropped)

    def diseases(self, ddinter_id: str) -> dict[str, dict]:
        if ddinter_id not in self._diseases:
            self._diseases[ddinter_id] = {str(r["interaction_id"]): r for r in self.client.diseases(ddinter_id)}
        return self._diseases[ddinter_id]

    def foods(self, ddinter_id: str) -> dict[str, dict]:
        if ddinter_id not in self._foods:
            self._foods[ddinter_id] = {str(r["interaction_id"]): r for r in self.client.foods(ddinter_id)}
        return self._foods[ddinter_id]


# --- planning (read-only) ---------------------------------------------------------------------


def _plan(conn: psycopg.Connection, cid: str) -> _ProductPlan | StageResult:
    rows = conn.execute(
        """SELECT bpi.xm_code, c.bds_id
             FROM curated.brand_product_ingredient bpi
             LEFT JOIN curated.substance_code c ON c.system = 'ICD11_XM' AND c.code = bpi.xm_code
            WHERE bpi.concept_id = %s ORDER BY bpi.xm_code""",
        (cid,),
    ).fetchall()
    if not rows:
        return _fail(cid, "no ICD-11 ingredient mapping from DGDA")
    missing = [xm for xm, bds in rows if bds is None]
    if missing:
        return _fail(cid, f"no substance for {', '.join(missing)}; run the substances stage first")
    subs = []
    for bds_id in sorted({bds for _, bds in rows}):
        names = conn.execute(
            "SELECT name FROM curated.substance_name WHERE bds_id = %s AND name_type = ANY(%s)",
            (bds_id, list(_NAME_TYPES)),
        ).fetchall()
        codes = conn.execute(
            "SELECT code FROM curated.substance_code WHERE bds_id = %s AND system = 'DRUGBANK'", (bds_id,)
        ).fetchall()
        keys = frozenset(k for (n,) in names if (k := normalize_name(n)))
        subs.append(_Sub(bds_id, keys, frozenset(c.strip().upper() for (c,) in codes)))
    route = conn.execute(
        """SELECT cd.route FROM curated.brand_product bp
           LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
           WHERE bp.concept_id = %s""",
        (cid,),
    ).fetchone()
    return _ProductPlan(route[0] if route else None, subs)


# --- per-product work (inside the product's savepoint) ----------------------------------------


def _upsert_drug(conn, d: DDInterDrug, route_scope: str) -> bool:
    """Upsert the drug (``fetched_at`` always refreshed); True when it is new or its data changed."""
    changed = conn.execute(
        """SELECT NOT EXISTS (SELECT 1 FROM curated.ddinter_drug WHERE ddinter_id = %s AND name = %s
             AND atc_codes IS NOT DISTINCT FROM %s::text[] AND drugbank_id IS NOT DISTINCT FROM %s
             AND route_scope = %s)""",
        (d.ddinter_id, d.name, list(d.atc_codes), d.drugbank_id, route_scope),
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO curated.ddinter_drug (ddinter_id, name, atc_codes, drugbank_id, route_scope)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (ddinter_id) DO UPDATE SET name = EXCLUDED.name, atc_codes = EXCLUDED.atc_codes,
             drugbank_id = EXCLUDED.drugbank_id, route_scope = EXCLUDED.route_scope, fetched_at = now()""",
        (d.ddinter_id, d.name, list(d.atc_codes), d.drugbank_id, route_scope),
    )
    return changed


def _upsert_code(conn, bds_id: str, ddinter_id: str, route_scope: str, method: str, confidence: float) -> bool:
    """True when the mapping is new or its scope/method/confidence changed (an identical row is not rewritten)."""
    return conn.execute(
        """INSERT INTO curated.substance_code (bds_id, system, code, route_scope, source, method, confidence)
           VALUES (%s, 'DDINTER', %s, %s, %s, %s, %s)
           ON CONFLICT (bds_id, system, code) DO UPDATE SET route_scope = EXCLUDED.route_scope,
             source = EXCLUDED.source, method = EXCLUDED.method, confidence = EXCLUDED.confidence
           WHERE (substance_code.route_scope, substance_code.source, substance_code.method, substance_code.confidence)
                 IS DISTINCT FROM (EXCLUDED.route_scope, EXCLUDED.source, EXCLUDED.method, EXCLUDED.confidence)
           RETURNING 1""",
        (bds_id, ddinter_id, route_scope, SOURCE, method, confidence),
    ).fetchone() is not None


def _upsert_name(conn, bds_id: str, name: str) -> bool:
    """True when the name is new."""
    return conn.execute(
        """INSERT INTO curated.substance_name (bds_id, name, name_type, source)
           VALUES (%s, %s, 'ddinter', %s) ON CONFLICT DO NOTHING RETURNING 1""",
        (bds_id, name, SOURCE),
    ).fetchone() is not None


def _upsert_coverage(conn, bds_id: str, coverage: str, note: str) -> bool:
    """Upsert (``updated_at`` always refreshed); True when the coverage is new or its value/note changed."""
    changed = conn.execute(
        """SELECT NOT EXISTS (SELECT 1 FROM curated.interaction_coverage
                               WHERE bds_id = %s AND coverage = %s AND note IS NOT DISTINCT FROM %s)""",
        (bds_id, coverage, note),
    ).fetchone()[0]
    conn.execute(
        """INSERT INTO curated.interaction_coverage (bds_id, coverage, note) VALUES (%s, %s, %s)
           ON CONFLICT (bds_id) DO UPDATE SET coverage = EXCLUDED.coverage, note = EXCLUDED.note,
             updated_at = now()""",
        (bds_id, coverage, note),
    )
    return changed


def _upsert_many(cur: psycopg.Cursor, sql: str, rows: list[tuple]) -> list[tuple]:
    """executemany of an upsert whose ``RETURNING`` yields a row only when it inserted or changed one."""
    if not rows:
        return []
    cur.executemany(sql, rows, returning=True)
    out: list[tuple] = []
    while True:
        out.extend(cur.fetchall())
        if not cur.nextset():
            return out


def _store_id_data(conn, run: _Run, ddinter_id: str, pair_list: _PairList | None) -> set[str]:
    """Pairs, diseases and foods of one mapped DDInter drug (idempotent upserts; an identical row is not
    rewritten). ``pair_list`` None (incomplete) writes no pair row; its ``extra`` pairs are inserted only where no row
    exists. Returns the DDInter ids whose rows were inserted or changed: both sides of a changed pair."""
    with conn.cursor() as cur:
        pairs = _upsert_many(
            cur,
            """INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (ddinter_a, ddinter_b) DO UPDATE SET severity = EXCLUDED.severity,
                 actions = EXCLUDED.actions, partner_name_a = EXCLUDED.partner_name_a,
                 partner_name_b = EXCLUDED.partner_name_b
               WHERE (ddinter_pair.severity, ddinter_pair.actions, ddinter_pair.partner_name_a, ddinter_pair.partner_name_b)
                     IS DISTINCT FROM (EXCLUDED.severity, EXCLUDED.actions, EXCLUDED.partner_name_a, EXCLUDED.partner_name_b)
               RETURNING ddinter_a, ddinter_b""",
            [] if pair_list is None else
            [(a, b, sev, actions, na, nb) for (a, b), (na, nb, sev, actions) in pair_list.graph.items()],
        )
        # interact-with-only partners: never overwrite a row a graph wrote, and an existing row is not "changed"
        pairs += _upsert_many(
            cur,
            """INSERT INTO curated.ddinter_pair (ddinter_a, ddinter_b, severity, actions, partner_name_a, partner_name_b)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (ddinter_a, ddinter_b) DO NOTHING
               RETURNING ddinter_a, ddinter_b""",
            [] if pair_list is None else
            [(a, b, sev, actions, na, nb) for (a, b), (na, nb, sev, actions) in pair_list.extra.items()],
        )
        own = _upsert_many(
            cur,
            """INSERT INTO curated.ddinter_disease (ddinter_id, interaction_id, disease_name, severity, text, refs)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (ddinter_id, interaction_id) DO UPDATE SET disease_name = EXCLUDED.disease_name,
                 severity = EXCLUDED.severity, text = EXCLUDED.text, refs = EXCLUDED.refs
               WHERE (ddinter_disease.disease_name, ddinter_disease.severity, ddinter_disease.text, ddinter_disease.refs)
                     IS DISTINCT FROM (EXCLUDED.disease_name, EXCLUDED.severity, EXCLUDED.text, EXCLUDED.refs)
               RETURNING 1""",
            [(ddinter_id, iid, r.get("disease_name") or "", r.get("severity") or "unknown",
              clean_text(r.get("text")), list(r.get("references") or []))
             for iid, r in run.diseases(ddinter_id).items()],
        )
        own += _upsert_many(
            cur,
            """INSERT INTO curated.ddinter_food
                 (ddinter_id, interaction_id, food, severity, mechanism, description, management, refs)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (ddinter_id, interaction_id) DO UPDATE SET food = EXCLUDED.food,
                 severity = EXCLUDED.severity, mechanism = EXCLUDED.mechanism, description = EXCLUDED.description,
                 management = EXCLUDED.management, refs = EXCLUDED.refs
               WHERE (ddinter_food.food, ddinter_food.severity, ddinter_food.mechanism, ddinter_food.description,
                      ddinter_food.management, ddinter_food.refs)
                     IS DISTINCT FROM (EXCLUDED.food, EXCLUDED.severity, EXCLUDED.mechanism, EXCLUDED.description,
                                       EXCLUDED.management, EXCLUDED.refs)
               RETURNING 1""",
            [(ddinter_id, iid, r.get("food_name") or "", r.get("severity") or "unknown", r.get("mechanism"),
              clean_text(r.get("interaction")), clean_text(r.get("management")), list(r.get("references") or []))
             for iid, r in run.foods(ddinter_id).items()],
        )
    return {i for a, b in pairs for i in (a, b)} | ({ddinter_id} if own else set())


def _clean_interaction(text: InteractionText) -> InteractionText | None:
    """Placeholders as missing; None when DDInter has neither an interaction nor a management text."""
    interaction, management = clean_text(text.interaction), clean_text(text.management)
    if interaction is None and management is None:
        return None
    return InteractionText(interaction, management, tuple(text.refs))


def _ensure_text(conn, run: _Run, pair: Pair, pending: _Pending) -> None:
    """Make sure the pair's interaction text is stored; fetch at most once per run, and not at all
    if a previous run stored it (the pair row carries the interaction id). A stored row with a placeholder
    counts as not stored (re-fetched); a text that is empty upstream is not stored and its old row is deleted."""
    a, b = pair
    if pair not in run.texts:
        row = conn.execute(
            f"""SELECT p.interaction_id, t.interaction_id IS NOT NULL AND {_TEXT_ROW_CLEAN}
                  FROM curated.ddinter_pair p
                  LEFT JOIN curated.ddinter_interaction_text t ON t.interaction_id = p.interaction_id
                 WHERE p.ddinter_a = %s AND p.ddinter_b = %s""",
            pair,
        ).fetchone()
        iid, stored = row if row else (None, False)
        if stored:
            pending.texts.add(pair)
            return
        if iid is None:
            iid = run.client.pair_interaction_id(a, b)  # from the lower id side, once per pair
        if iid is None:
            # DDInter's per-drug interact-with lists are not provably symmetric: ask the other side too
            iid = run.client.pair_interaction_id(b, a)
        if iid is None:
            run.texts[pair] = None
        else:
            text = _clean_interaction(run.client.interaction(iid))
            run.fetched.add(pair)
            run.texts[pair] = None if text is None else (iid, text)
    hit = run.texts[pair]
    if hit is None:
        # No text this run: a row left from before the placeholder rule (both fields placeholders) is removed,
        # so the pair reads as text missing rather than showing "None". Nothing to delete on later runs.
        deleted = conn.execute(
            f"""DELETE FROM curated.ddinter_interaction_text t USING curated.ddinter_pair p
                 WHERE p.ddinter_a = %s AND p.ddinter_b = %s AND t.interaction_id = p.interaction_id
                   AND {_TEXT_ROW_EMPTY}
                RETURNING 1""",
            pair,
        ).fetchone() is not None
        if deleted:
            pending.changed.ddinter_ids |= {a, b}
    else:
        iid, text = hit
        text_changed = conn.execute(
            """INSERT INTO curated.ddinter_interaction_text (interaction_id, interaction, management, refs)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (interaction_id) DO UPDATE SET interaction = EXCLUDED.interaction,
                 management = EXCLUDED.management, refs = EXCLUDED.refs
               WHERE (ddinter_interaction_text.interaction, ddinter_interaction_text.management,
                      ddinter_interaction_text.refs)
                     IS DISTINCT FROM (EXCLUDED.interaction, EXCLUDED.management, EXCLUDED.refs)
               RETURNING 1""",
            (iid, text.interaction, text.management, list(text.refs)),
        ).fetchone() is not None
        linked = conn.execute(
            """UPDATE curated.ddinter_pair SET interaction_id = %s
               WHERE ddinter_a = %s AND ddinter_b = %s AND interaction_id IS DISTINCT FROM %s RETURNING 1""",
            (iid, a, b, iid),
        ).fetchone() is not None
        if text_changed or linked:
            pending.changed.ddinter_ids |= {a, b}
    pending.texts.add(pair)


def _process(conn: psycopg.Connection, run: _Run, cid: str, plan: _ProductPlan, pending: _Pending) -> StageResult:
    mappings: list[dict] = []
    coverage: list[dict] = []
    notes: list[str] = []
    ids: set[str] = set()         # every candidate entry: shared substance facts, stored whatever the route
    chosen_ids: set[str] = set()  # the entries the route rule picks for this product (§8.1 item 2)
    chosen: list[dict] = []
    route_assumed = False
    for sub in plan.subs:
        entries = run.candidates(sub.keys)
        if not entries:
            if _upsert_coverage(conn, sub.bds_id, "none", NONE_NOTE):
                pending.changed.bds_ids.add(sub.bds_id)
            coverage.append({"bds_id": sub.bds_id, "coverage": "none"})
            notes.append(NONE_NOTE)
            continue
        for e in entries:
            d = run.detail(e.ddinter_id)
            confirmed = d.drugbank_id is not None and d.drugbank_id.strip().upper() in sub.drugbank
            method, confidence = ("drugbank", 1.0) if confirmed else ("name", 0.7)
            # the drug row means "this entry's full pair list is stored": written only when no pair of the list was
            # left out (§7.4, D41); an earlier row and its list stay
            if not run.missing_from(e.ddinter_id) and _upsert_drug(conn, d, e.route_scope):
                pending.changed.ddinter_ids.add(e.ddinter_id)
            if _upsert_code(conn, sub.bds_id, e.ddinter_id, e.route_scope, method, confidence):
                pending.changed.bds_ids.add(sub.bds_id)
            if _upsert_name(conn, sub.bds_id, d.name):
                pending.changed.bds_ids.add(sub.bds_id)
            mappings.append({"bds_id": sub.bds_id, "ddinter_id": e.ddinter_id, "name": d.name,
                             "route_scope": e.route_scope, "method": method, "confidence": confidence})
            if not confirmed:
                notes.append(f"DDInter {e.ddinter_id} matched by name only")
            ids.add(e.ddinter_id)
        if _upsert_coverage(conn, sub.bds_id, "full", "DDInter " + ", ".join(e.ddinter_id for e in entries)):
            pending.changed.bds_ids.add(sub.bds_id)
        coverage.append({"bds_id": sub.bds_id, "coverage": "full"})
        picked, assumed = choose(entries, plan.route)
        if not picked:
            notes.append(no_route_entry_note(plan.route))
        for e in picked:
            if assumed:
                notes.append(route_assumed_note(e.ddinter_id, e.route_scope, plan.route))
            chosen_ids.add(e.ddinter_id)
            chosen.append({"bds_id": sub.bds_id, "ddinter_id": e.ddinter_id, "route_scope": e.route_scope,
                           "route_assumed": assumed})
        route_assumed = route_assumed or (assumed and bool(picked))

    pairs: set[Pair] = set()
    fetchable: set[Pair] = set()
    disease_count = food_count = 0
    for ddinter_id in sorted(ids, key=_idkey):
        listed = run.pair_list(ddinter_id)
        if ddinter_id not in run.stored_ids:
            pending.changed.ddinter_ids |= _store_id_data(conn, run, ddinter_id, listed)
            pending.ids.add(ddinter_id)
        mine = listed.all() if listed is not None else {}
        if ddinter_id in chosen_ids:
            pairs.update(mine)
        disease_count += len(run.diseases(ddinter_id))
        food_count += len(run.foods(ddinter_id))
        for pair in sorted(mine):
            other = pair[1] if pair[0] == ddinter_id else pair[0]
            # Texts only where both sides are in scope (this batch or mapped by an earlier one); pairs with
            # an unmapped drug keep severity/actions and get their text once that drug is mapped.
            # (pair_list already leaves out pairs with an incomplete entry; the second test keeps that explicit)
            if other in run.scope_ids and other not in run.incomplete:
                fetchable.add(pair)
                if pair not in run.stored_texts and pair not in pending.texts:
                    _ensure_text(conn, run, pair, pending)

    # A pair without text is reported only on the products it applies to (§8.1 item 3): one side chosen by this
    # product, the other chosen by an in-scope product. Fetching texts stays as wide as before (shared facts).
    text_missing = sorted(p for p in fetchable
                          if p in run.texts and run.texts[p] is None and _applies(p, chosen_ids, run.scope_chosen))
    notes.extend(f"DDInter text not found for {a}/{b}" for a, b in text_missing)

    evidence = {"mappings": mappings, "coverage": coverage, "pair_count": len(pairs),
                "disease_count": disease_count, "food_count": food_count,
                "text_fetch_count": len(pairs & run.fetched), "text_missing": [list(p) for p in text_missing],
                "route": plan.route, "chosen": chosen, "route_assumed": route_assumed}
    incomplete = sorted({m for i in chosen_ids for m in run.missing_from(i)}, key=_idkey)
    if incomplete:
        # "No interaction listed" must never come from a partial list: the product cannot be approved (§7.2 step 5).
        # One note per entry whose read failed, whether the chosen entry itself or a partner its list dropped
        return StageResult(cid, "fail", "; ".join(INCOMPLETE_NOTE.format(i) for i in incomplete), evidence)
    return StageResult(cid, "warn" if notes else "ok", "; ".join(notes), evidence)


class DDInterPlan:
    """A planned DDInter run: the per-run client caches and one plan per product of the run."""

    def __init__(self, run: _Run, plans: dict[str, _ProductPlan | StageResult]):
        self._run = run
        self._plans = plans

    def process(self, conn: psycopg.Connection, cid: str, changes: SharedChanges | None = None) -> StageResult:
        """Map and store one planned product inside its own savepoint (per-product isolation).

        ``changes`` (if given) collects the shared rows the product really changed, once its savepoint commits."""
        plan = self._plans[cid]
        if isinstance(plan, StageResult):
            return plan
        pending = _Pending()
        try:
            with conn.transaction():  # one savepoint per product; all its DB work happens inside
                res = _process(conn, self._run, cid, plan, pending)
        except (psycopg.OperationalError, psycopg.InterfaceError):
            raise
        except Exception as e:
            return _fail(cid, error_note(e))
        self._run.stored_ids |= pending.ids
        self._run.stored_texts |= pending.texts
        if changes is not None:
            changes.merge(pending.changed)
        return res


def plan_ddinter(conn: psycopg.Connection, client: DDInterClient, concept_ids: list[str]) -> DDInterPlan:
    """Fetch the drug list once and plan every product of the run (read-only, apart from snapshots)."""
    run = _Run(client, client.drug_list())  # once per run; a failure here is run-level and propagates
    # DDInter ids mapped by earlier batches: pairs between them and this batch's drugs get texts too
    run.scope_ids.update(code for (code,) in conn.execute(
        "SELECT DISTINCT code FROM curated.substance_code WHERE system = 'DDINTER'").fetchall())
    run.scope_chosen.update(_mapped_chosen(conn))

    plans: dict[str, _ProductPlan | StageResult] = {}
    for cid in dict.fromkeys(concept_ids):
        try:
            with conn.transaction():
                plans[cid] = _plan(conn, cid)
        except (psycopg.OperationalError, psycopg.InterfaceError):
            raise
        except Exception as e:
            plans[cid] = _fail(cid, error_note(e))
    candidate_ids: set[str] = set()
    for plan in plans.values():
        if isinstance(plan, _ProductPlan):
            for sub in plan.subs:
                entries = run.candidates(sub.keys)
                candidate_ids.update(e.ddinter_id for e in entries)
                run.scope_ids.update(e.ddinter_id for e in entries)
                run.scope_chosen.update(e.ddinter_id for e in choose(entries, plan.route)[0])
    # §8.1 item 5: read every candidate's interact-with list now (memoised; no detail or graph read), so an incomplete
    # entry is known before any product writes a pair row that touches it
    run.incomplete = {i for i in sorted(candidate_ids, key=_idkey) if not run.listing(i).complete}
    return DDInterPlan(run, plans)


def _mapped_chosen(conn: psycopg.Connection) -> set[str]:
    """The DDInter entries the route rule picks for every product already mapped (earlier batches), each by its own
    route. Read before this run writes anything, so it describes the earlier batches only."""
    rows = conn.execute(
        """SELECT bp.concept_id, cd.route, xm.bds_id, dd.code, dd.route_scope
             FROM curated.brand_product bp
             LEFT JOIN curated.clinical_drug cd ON cd.bdc_id = bp.bdc_id
             JOIN curated.brand_product_ingredient bpi ON bpi.concept_id = bp.concept_id
             JOIN curated.substance_code xm ON xm.system = 'ICD11_XM' AND xm.code = bpi.xm_code
             JOIN curated.substance_code dd ON dd.bds_id = xm.bds_id AND dd.system = 'DDINTER'""").fetchall()
    groups: dict[tuple[str, str], tuple[str | None, list[_Entry]]] = {}
    for concept_id, route, bds_id, code, scope in rows:
        groups.setdefault((concept_id, bds_id), (route, []))[1].append(_Entry(code, "", scope))
    out: set[str] = set()
    for route, entries in groups.values():
        out.update(e.ddinter_id for e in choose(entries, route)[0])
    return out


def map_and_load_ddinter(conn: psycopg.Connection, client: DDInterClient, concept_ids: list[str],
                         changes: SharedChanges | None = None) -> list[StageResult]:
    """Plan and process every product in the caller's transaction (no commits); ``changes`` as in ``process``."""
    if not concept_ids:
        return []
    plan = plan_ddinter(conn, client, concept_ids)
    return [plan.process(conn, cid, changes) for cid in concept_ids]
