# BDDrug KB — Sprint Roadmap + Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> On approval, this file is copied into the repo as `docs/superpowers/plans/2026-10-11-bddrug-sprint-01.md`. Each later sprint gets its own detailed plan, written at the start of that sprint and informed by tester feedback.

**Goal:** Build the Bangladesh drug knowledge base incrementally. First, take **10 pilot medicines through the entire pipeline**. Then scale in **small, human-verified batches**. Every 1-week sprint ends with a public, server-rendered preview site where engineers and pharmacists compare the raw source against our extracted data.

**Architecture:** Python ETL loads sources into PostgreSQL (`raw` → `curated` schemas). A Java 21 / Spring Boot WebFlux API reads `curated`. A Next.js SSR site calls the API **over the internal Docker network only**: the API is never exposed publicly, so no bulk JSON reaches the browser. Traefik terminates TLS and rate-limits. Everything runs from one Docker Compose file on the team's VM, deployed by GitHub Actions from a private repo.

**Tech Stack:**
- Python 3.12: httpx 0.27, psycopg 3.2, pytest 8.3, respx 0.21, testcontainers 4.8
- Java 21: Spring Boot 3.4.2 (WebFlux, R2DBC), Testcontainers 1.20.4, Flyway 10
- Next.js 15.1.6 / React 19.0.0, Vitest 2.1.8
- PostgreSQL 16 (pg_trgm), Traefik v3.2, Keycloak 26 (Sprint 2), GitHub Actions, GHCR

**Spec:** "BD Drug Knowledge Base — Design Proposal", approved 2026-10-11: https://claude.ai/code/artifact/62df7be9-d0cc-4706-a020-1473b1ea1f38

## Global Constraints
- The brand source of truth is DGDA-Drugs on `https://api.tr.ocl.dghs.gov.bd` (owner `MoHFW`, source `DGDA-Drugs`, 39,196 concepts).
- MedEx-derived data (`prescription` DB) is **never** shown on the site or served by the API.
- Substance IDs are our own permanent `BDS-` IDs. External codes are crosswalks (from Sprint 3).
- "No interaction data" must never be presented as "no interactions" (from Sprint 6).
- The site is open to browse. Flag/request actions need a Keycloak login plus captcha (Sprint 2).
- Frontend is server-rendered. The API is reachable only inside the Docker network. Traefik rate-limits public traffic.
- No secrets in code. All config comes from environment variables (`.env` on the VM, GitHub Actions secrets).
- API responses use the platform envelope: `{success, data, message, errors, metadata{timestamp, requestId}}`.
- Commit format is `type(scope): description`, with scopes `etl`, `api`, `web`, `db`, `deploy`.
- Never log PHI. This system holds no patient data, and it must stay that way.

## Review Focus
1. **Search input with SQL wildcard characters** (`%`, `_`, `\`) or Bengali text. A user expects a literal match, not "match everything" or a 500 error. Test in Task 5.
2. **Too-short, empty or very long queries, and out-of-range pages.** A user expects a clear 400 error or an empty result, never a full-table scan or a crash. Test in Task 5.
3. **A DGDA product with no ingredient mapping.** A user expects the page to render and say "No ingredient mapping from DGDA". Test in Task 6.
4. **The OCL pull dying mid-run.** A re-run must be idempotent, with no duplicates and no stale ingredient rows. Test in Task 4.
5. **A concept ID in a batch file that OCL doesn't know** (typo, or retired upstream). The run must finish, record that item as `issue` with note "not found at source", and load the rest. Test in Task 4. (Whitespace collapsing in `generic_content_raw` is also tested, in Task 3.)

---

## Delivery strategy: pilot 10 first, then gated batches

**Why:** large unreviewed runs hide extraction errors, and agent-written code can make plausible-looking mistakes. Small batches, each with evidence a human can check, surface problems while they are cheap to fix.

**Phase A — Pilot 10 (S1–S3).** Ten medicines go through **every** stage before any scaling: DGDA product → ingredient parse → substance (`BDS-`) → INN/USAN synonyms, RxCUI, ATC → clinical drug → DDInter mapping → interactions → site.
- Each stage's first implementation is the simplest that works for these 10.
- The pharmacist picks the final 10. The proposed set covers the hard cases:

| Pilot medicine | Edge case it tests |
|---|---|
| Napa (paracetamol) | INN vs USAN name (Acetaminophen in DDInter) |
| An amlodipine besilate brand | Salt suffix |
| A warfarin brand | Many major interactions |
| An aspirin brand | Pairs with warfarin (Major) |
| A clarithromycin brand | Pairs with simvastatin (Major) |
| A simvastatin brand | Other half of that pair |
| An amoxicillin + clavulanic acid brand | Combination product |
| A chloramphenicol eye drop | Route-scoped DDInter entry |
| A domperidone brand | Not in DDInter → must show `coverage: none` |
| A metformin hydrochloride brand | Salt + very common drug |

**Phase B — Batches (S4 onwards).** Each batch is a committed list file (`batches/NNNN-<name>.txt` of DGDA concept IDs), chosen in order of generic popularity (DGDA brand count). Each batch goes through these steps:
1. **Run** the pipeline with `--batch <file>`. Every record keeps its raw source snapshot.
2. **Report:** the batch page shows counts, unmatched items and warnings, and **raw source beside extracted data** for every record, with a link to the original OCL or DDInter page.
3. **Review:** engineers check the extraction and pharmacists check the clinical mapping. Each record is marked `ok` or `issue` with a note. In S1 this uses a shared sheet; from S2, buttons on the page behind login.
4. **Gate:** a batch is `approved` only when every record is `ok`, or its issue is fixed and re-run. Only approved records appear in the public browse pages and the API.
5. **Size rule:**
   - Start at 10.
   - Move up to 50, then 100, only after **two consecutive batches with ≤1 issue each and no systemic bug**.
   - Any batch with more than 5% issues, or a systemic bug, drops back to 10 until the cause is fixed and covered by a test.

**Note:** the DGDA pull is a deterministic copy from a government API, with no interpretation. Once the pilot proves the copy is faithful, the team may choose to pull the full raw catalog in one go and apply batch review only to the interpretation stages (parsing, matching, interactions). That is a decision for the team, not a default.

## Sprint Roadmap (1-week sprints; every sprint ends with a preview deploy and a tester demo)

| Sprint | Theme | What testers see on the site at the end of the sprint |
|---|---|---|
| **S1** | Skeleton + DGDA stage for the pilot 10 | Pilot batch page: each of the 10 products with raw OCL JSON beside the extracted fields; search and product pages; HTTPS, CI/CD, rate limit, internal-only API |
| S2 | Substance and code stages (pilot 10) + login | Ingredient parse, `BDS-` substances, salt stripping, INN/BAN/USAN synonyms, RxCUI and ATC (RxNav), clinical drug (strength, EDQM form), all shown with evidence. Keycloak login and captcha; per-record ok/issue buttons. |
| S3 | DDInter stage (pilot 10) + pilot sign-off | Polite crawl of only the pilot substances (pairs, text, disease, food); route scope; substance pages with interactions and `coverage: none`; checker page v0. **Pharmacist signs off the whole pilot.** |
| S4 | Batch machinery hardened | Batch status workflow, batch report (counts, unmatched, diffs vs previous run), re-run of a single record; batches 0002–0003 (10 each) |
| S5 | Batches at 10, then 50 | Fixes from batch findings, each with a regression test; flag-a-problem on every public page; batches continue under the size rule |
| S6 | Batches toward 100 + drug–disease ICD mapping | Disease name → ICD-10/11 mapping reviewed per batch |
| S7 | Pharmacist workbench v1 | Queue across batches (fuzzy, unmatched, conflict, flags), bulk approve of exact-synonym groups, `verified_by` badges |
| S8 | Interaction checker v1 | Pick brands → alerts by severity; gold test set (200 known interactions) in CI |
| S9 | Releases and QA | Monthly release snapshot of approved records only; QA gates; release changelog |
| S10 | Partner API | API keys, metering, OpenAPI docs, load test (p95 < 300 ms for a 10-drug check) |
| S11 | Niramoy integration | Existing `Medicines` mapped to DAR numbers; e-Rx calls the check |
| S12 | Hardening | Security review, backup and restore drill, coverage push toward v1 targets |

Batches keep running every sprint from S4 onwards, alongside the feature work.

---

## Sprint 1 — Walking Skeleton (detailed)

**Sprint goal:** a pharmacist opens `https://<preview-domain>/batches/0001-pilot` and sees the 10 pilot products, each with the **raw OCL source beside the extracted fields** and a link to the original record. They can also search and open product pages. Every push to `main` redeploys automatically. Nothing outside the pilot batch is loaded.

### File structure
```
bddrug/                                  (repo root = current ddinter2 folder; private GitHub repo)
├── batches/0001-pilot.txt               the 10 pilot DGDA concept IDs (pharmacist-approved)
├── db/migrations/V1__init.sql           schemas raw + curated, product tables, trigram indexes
├── db/migrations/V2__batches.sql        ops.batch, ops.batch_item (review status per record)
├── etl/
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── src/bddrug_etl/
│   │   ├── ocl/client.py                OclClient: paged concept iterator
│   │   ├── ocl/transform.py             concept → ProductRow (pure)
│   │   ├── load/products.py             idempotent upsert into raw + curated
│   │   └── jobs/load_dgda.py            CLI entry point
│   └── tests/ (test_ocl_client.py, test_transform.py, test_load_products.py, fixtures/tericin.json)
├── api/                                 Spring Boot, hexagonal
│   ├── build.gradle.kts, settings.gradle.kts, Dockerfile
│   └── src/main/java/com/niramoy/bddrug/
│       ├── domain/Product.java, Ingredient.java
│       ├── application/port/ProductQueryPort.java
│       ├── application/ProductQueryService.java
│       ├── adapter/persistence/R2dbcProductAdapter.java
│       └── presentation/ProductController.java, ApiResponse.java, ApiExceptionHandler.java
├── web/                                 Next.js App Router, SSR only
│   ├── package.json, next.config.ts, Dockerfile
│   ├── lib/api.ts                       server-only API client
│   ├── app/layout.tsx, app/page.tsx, app/products/[id]/page.tsx
│   └── tests/api.test.ts
├── deploy/docker-compose.yml, deploy/.env.example
└── .github/workflows/ci.yml, .github/workflows/deploy.yml
```

---

### Task 1: Repo, database schema, local compose

**Files:**
- Create: `db/migrations/V1__init.sql`, `deploy/docker-compose.yml` (db + flyway only for now), `deploy/.env.example`, `.gitignore`, `README.md`

**Interfaces:**
- Produces:
  - `raw.ocl_concept(source, concept_id, payload jsonb, fetched_at)`
  - `curated.brand_product(concept_id PK, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag, updated_at)`
  - `curated.brand_product_ingredient(concept_id, xm_code, ingredient_name)`

- [ ] **Step 1: Init repo**
```bash
cd /Users/tanvirhossain/Documents/000_office/umr/gitlab/ddinter2
git init -b main && mkdir -p db/migrations deploy etl api web .github/workflows docs/superpowers/plans
printf '.env\n__pycache__/\n.venv/\nnode_modules/\n.next/\nbuild/\n.gradle/\n' > .gitignore
```

- [ ] **Step 2: Write the migration** `db/migrations/V1__init.sql`
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS curated;

CREATE TABLE raw.ocl_concept (
    source      TEXT        NOT NULL,
    concept_id  TEXT        NOT NULL,
    payload     JSONB       NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source, concept_id)
);

CREATE TABLE curated.brand_product (
    concept_id          TEXT PRIMARY KEY,
    dar_number          TEXT NOT NULL,
    trade_name          TEXT NOT NULL,
    company             TEXT NOT NULL,
    dosage_form         TEXT NOT NULL,
    generic_content_raw TEXT NOT NULL,
    quality_flag        TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX brand_product_dar_idx   ON curated.brand_product (dar_number);
CREATE INDEX brand_product_trade_trgm ON curated.brand_product USING gin (lower(trade_name) gin_trgm_ops);
CREATE INDEX brand_product_generic_trgm ON curated.brand_product USING gin (lower(generic_content_raw) gin_trgm_ops);

CREATE TABLE curated.brand_product_ingredient (
    concept_id      TEXT NOT NULL REFERENCES curated.brand_product(concept_id) ON DELETE CASCADE,
    xm_code         TEXT NOT NULL,
    ingredient_name TEXT NOT NULL,
    PRIMARY KEY (concept_id, xm_code)
);
```

- [ ] **Step 3: Compose (db + migrations)** `deploy/docker-compose.yml`
```yaml
name: bddrug
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: bddrug
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [dbdata:/var/lib/postgresql/data]
    healthcheck: {test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d bddrug"], interval: 5s, retries: 20}
    networks: [internal]
  flyway:
    image: flyway/flyway:10
    command: -url=jdbc:postgresql://db:5432/bddrug -user=${DB_USER} -password=${DB_PASSWORD} migrate
    volumes: [../db/migrations:/flyway/sql:ro]
    depends_on: {db: {condition: service_healthy}}
    networks: [internal]
volumes: {dbdata: {}}
networks: {internal: {}}
```
`deploy/.env.example`:
```
DB_USER=bddrug
DB_PASSWORD=change-me
PREVIEW_DOMAIN=drugkb.example.com
ACME_EMAIL=ops@example.com
IMAGE_TAG=latest
GHCR_OWNER=your-org
```

- [ ] **Step 4: Verify the migration applies**
Run: `cd deploy && cp .env.example .env && docker compose up -d db && docker compose run --rm flyway && docker compose exec db psql -U bddrug -d bddrug -c '\dt curated.*'`
Expected: Flyway reports "Successfully applied 1 migration". `\dt` lists `brand_product` and `brand_product_ingredient`.

- [ ] **Step 5: Commit**
```bash
git add . && git commit -m "chore(db): repo skeleton, V1 schema, local compose"
```

---

### Task 2: OCL client (paged iterator)

**Files:**
- Create: `etl/pyproject.toml`, `etl/src/bddrug_etl/__init__.py`, `etl/src/bddrug_etl/ocl/__init__.py`, `etl/src/bddrug_etl/ocl/client.py`
- Test: `etl/tests/test_ocl_client.py`

**Interfaces:**
- Produces: `OclClient(base_url: str, http: httpx.Client, page_size: int = 500, pause_s: float = 0.5)` with:
  - `.get_concept(owner: str, source: str, concept_id: str) -> dict | None`: `None` on 404; used for batches
  - `.iter_concepts(owner: str, source: str) -> Iterator[dict]`: kept for a later full pull, if the team chooses one

- [ ] **Step 1: pyproject** `etl/pyproject.toml`
```toml
[project]
name = "bddrug-etl"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = ["httpx==0.27.2", "psycopg[binary]==3.2.3"]

[project.optional-dependencies]
test = ["pytest==8.3.4", "respx==0.21.1", "testcontainers[postgres]==4.8.2"]

[project.scripts]
bddrug-etl = "bddrug_etl.jobs.load_dgda:main"

[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]
```
Run: `cd etl && python3.12 -m venv .venv && . .venv/bin/activate && pip install -e '.[test]'`

- [ ] **Step 2: Write the failing test** `etl/tests/test_ocl_client.py`
```python
import httpx, respx
from bddrug_etl.ocl.client import OclClient

BASE = "https://ocl.test"
URL = f"{BASE}/orgs/MoHFW/sources/DGDA-Drugs/concepts/"

@respx.mock
def test_iter_concepts_follows_next_header_until_absent():
    respx.get(URL, params={"page": "2"}).mock(
        return_value=httpx.Response(200, json=[{"id": "c3"}]))
    respx.get(URL).mock(return_value=httpx.Response(
        200, json=[{"id": "c1"}, {"id": "c2"}], headers={"next": f"{URL}?page=2"}))
    client = OclClient(BASE, httpx.Client(), page_size=2, pause_s=0)
    assert [c["id"] for c in client.iter_concepts("MoHFW", "DGDA-Drugs")] == ["c1", "c2", "c3"]

@respx.mock
def test_iter_concepts_treats_literal_none_next_as_end():
    respx.get(URL).mock(return_value=httpx.Response(200, json=[{"id": "c1"}], headers={"next": "None"}))
    client = OclClient(BASE, httpx.Client(), pause_s=0)
    assert [c["id"] for c in client.iter_concepts("MoHFW", "DGDA-Drugs")] == ["c1"]

@respx.mock
def test_iter_concepts_raises_on_http_error():
    respx.get(URL).mock(return_value=httpx.Response(503))
    client = OclClient(BASE, httpx.Client(), pause_s=0)
    import pytest
    with pytest.raises(httpx.HTTPStatusError):
        list(client.iter_concepts("MoHFW", "DGDA-Drugs"))

@respx.mock
def test_get_concept_requests_verbose_with_mappings():
    route = respx.get(f"{URL}341-0160-020--tericin/").mock(
        return_value=httpx.Response(200, json={"id": "341-0160-020--tericin"}))
    client = OclClient(BASE, httpx.Client(), pause_s=0)
    assert client.get_concept("MoHFW", "DGDA-Drugs", "341-0160-020--tericin")["id"] == "341-0160-020--tericin"
    assert route.calls.last.request.url.params["includeMappings"] == "true"

@respx.mock
def test_get_concept_returns_none_on_404():
    respx.get(f"{URL}nope/").mock(return_value=httpx.Response(404))
    assert OclClient(BASE, httpx.Client(), pause_s=0).get_concept("MoHFW", "DGDA-Drugs", "nope") is None
```

- [ ] **Step 3: Run to verify it fails**
Run: `cd etl && pytest tests/test_ocl_client.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bddrug_etl.ocl.client'`

- [ ] **Step 4: Implement** `etl/src/bddrug_etl/ocl/client.py`
```python
"""Read-only client for the national OCL terminology server (paged concepts)."""
import time
from collections.abc import Iterator

import httpx


class OclClient:
    def __init__(self, base_url: str, http: httpx.Client, page_size: int = 500, pause_s: float = 0.5):
        self.base_url = base_url.rstrip("/")
        self.http = http
        self.page_size = page_size
        self.pause_s = pause_s

    def get_concept(self, owner: str, source: str, concept_id: str) -> dict | None:
        url = f"{self.base_url}/orgs/{owner}/sources/{source}/concepts/{concept_id}/"
        response = self.http.get(url, params={"verbose": "true", "includeMappings": "true"}, timeout=60)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        if self.pause_s:
            time.sleep(self.pause_s)
        return response.json()

    def iter_concepts(self, owner: str, source: str) -> Iterator[dict]:
        url: str | None = f"{self.base_url}/orgs/{owner}/sources/{source}/concepts/"
        params: dict | None = {"limit": self.page_size, "verbose": "true", "includeMappings": "true"}
        while url:
            response = self.http.get(url, params=params, timeout=60)
            response.raise_for_status()
            yield from response.json()
            nxt = response.headers.get("next")
            url, params = (nxt, None) if nxt and nxt != "None" else (None, None)
            if url and self.pause_s:
                time.sleep(self.pause_s)
```
Also create empty `etl/src/bddrug_etl/__init__.py` and `etl/src/bddrug_etl/ocl/__init__.py`.

- [ ] **Step 5: Run to verify it passes**
Run: `pytest tests/test_ocl_client.py -v`
Expected: 5 passed

- [ ] **Step 6: Commit**
```bash
git add etl && git commit -m "feat(etl): OCL paged concept client"
```

---

### Task 3: Concept → ProductRow transform

**Files:**
- Create: `etl/src/bddrug_etl/ocl/transform.py`, `etl/tests/fixtures/tericin.json`
- Test: `etl/tests/test_transform.py`

**Interfaces:**
- Produces: dataclasses `Ingredient(xm_code: str, name: str)` and `ProductRow(concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag: str | None, ingredients: tuple[Ingredient, ...])`; function `concept_to_product(concept: dict) -> ProductRow | None`

- [ ] **Step 1: Fixture** `etl/tests/fixtures/tericin.json`, the real concept fetched on 2026-10-11, trimmed:
```json
{
  "id": "341-0160-020--tericin", "concept_class": "Drug", "retired": false, "display_name": "Tericin",
  "extras": {"company": "Beacon Pharmaceuticals PLC", "dar_number": "341-0160-020", "trade_name": "Tericin",
             "dosage_form": "Injection", "dar_quality_flag": "", "generic_content_raw": "Amphotericin B  50 mg/vial"},
  "mappings": [{"map_type": "Has-active-ingredient", "retired": false,
                "to_concept_code": "XM5TR4", "to_concept_name": "Amphotericin B"}]
}
```

- [ ] **Step 2: Write the failing test** `etl/tests/test_transform.py`
```python
import json, pathlib
from bddrug_etl.ocl.transform import Ingredient, concept_to_product

FIX = json.loads((pathlib.Path(__file__).parent / "fixtures/tericin.json").read_text())

def test_maps_extras_and_ingredients():
    p = concept_to_product(FIX)
    assert p.concept_id == "341-0160-020--tericin"
    assert p.dar_number == "341-0160-020"
    assert p.trade_name == "Tericin"
    assert p.company == "Beacon Pharmaceuticals PLC"
    assert p.dosage_form == "Injection"
    assert p.ingredients == (Ingredient("XM5TR4", "Amphotericin B"),)

def test_collapses_whitespace_in_generic_content():
    assert concept_to_product(FIX).generic_content_raw == "Amphotericin B 50 mg/vial"

def test_empty_quality_flag_becomes_none():
    assert concept_to_product(FIX).quality_flag is None

def test_skips_non_drug_and_retired_concepts():
    assert concept_to_product({**FIX, "concept_class": "Ingredient"}) is None
    assert concept_to_product({**FIX, "retired": True}) is None

def test_ignores_retired_and_other_mappings_and_dedupes():
    m = FIX["mappings"][0]
    c = {**FIX, "mappings": [m, m, {**m, "retired": True, "to_concept_code": "XX"}, {**m, "map_type": "Same-as"}]}
    assert concept_to_product(c).ingredients == (Ingredient("XM5TR4", "Amphotericin B"),)

def test_product_without_mappings_has_no_ingredients():
    assert concept_to_product({**FIX, "mappings": []}).ingredients == ()
```

- [ ] **Step 3: Run to verify it fails**
Run: `pytest tests/test_transform.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 4: Implement** `etl/src/bddrug_etl/ocl/transform.py`
```python
"""Pure mapping from an OCL DGDA-Drugs concept to our product row."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Ingredient:
    xm_code: str
    name: str


@dataclass(frozen=True)
class ProductRow:
    concept_id: str
    dar_number: str
    trade_name: str
    company: str
    dosage_form: str
    generic_content_raw: str
    quality_flag: str | None
    ingredients: tuple[Ingredient, ...]


def _clean(value: object) -> str:
    return " ".join(str(value or "").split())


def concept_to_product(concept: dict) -> ProductRow | None:
    if concept.get("concept_class") != "Drug" or concept.get("retired"):
        return None
    extras = concept.get("extras") or {}
    ingredients = {
        Ingredient(m["to_concept_code"], _clean(m.get("to_concept_name")))
        for m in concept.get("mappings") or []
        if m.get("map_type") == "Has-active-ingredient" and not m.get("retired") and m.get("to_concept_code")
    }
    return ProductRow(
        concept_id=concept["id"],
        dar_number=_clean(extras.get("dar_number")),
        trade_name=_clean(extras.get("trade_name") or concept.get("display_name")),
        company=_clean(extras.get("company")),
        dosage_form=_clean(extras.get("dosage_form")),
        generic_content_raw=_clean(extras.get("generic_content_raw")),
        quality_flag=_clean(extras.get("dar_quality_flag")) or None,
        ingredients=tuple(sorted(ingredients, key=lambda i: i.xm_code)),
    )
```

- [ ] **Step 5: Run to verify it passes**
Run: `pytest tests/test_transform.py -v`
Expected: 6 passed

- [ ] **Step 6: Commit**
```bash
git add etl && git commit -m "feat(etl): DGDA concept to product transform"
```

---

### Task 4: Idempotent loader + batch runs + CLI + ETL image

**Files:**
- Create: `db/migrations/V2__batches.sql`, `etl/src/bddrug_etl/load/__init__.py`, `etl/src/bddrug_etl/load/products.py`, `etl/src/bddrug_etl/load/batches.py`, `etl/src/bddrug_etl/jobs/__init__.py`, `etl/src/bddrug_etl/jobs/load_dgda.py`, `etl/Dockerfile`, `batches/0001-pilot.txt`
- Test: `etl/tests/test_load_products.py`, `etl/tests/test_batches.py`

**Interfaces:**
- Consumes: `concept_to_product`, `ProductRow`, `OclClient.get_concept`
- Produces:
  - `LoadStats(seen: int, loaded: int, skipped: int)`
  - `load_products(conn: psycopg.Connection, concepts: Iterable[dict], source: str = "DGDA-Drugs") -> LoadStats`
  - `read_batch_file(path: pathlib.Path) -> list[str]`
  - `run_batch(conn, client: OclClient, batch_id: str, concept_ids: list[str]) -> LoadStats`, which writes `ops.batch` / `ops.batch_item`
  - CLI `bddrug-etl --batch batches/0001-pilot.txt` (env `DATABASE_URL`, `OCL_BASE_URL`); the batch ID is the file stem

- [ ] **Step 0: Batch tables** `db/migrations/V2__batches.sql`
```sql
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE ops.batch (
    batch_id    TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'in_review' CHECK (status IN ('in_review', 'approved', 'rejected')),
    run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_count  INT NOT NULL
);

CREATE TABLE ops.batch_item (
    batch_id    TEXT NOT NULL REFERENCES ops.batch(batch_id) ON DELETE CASCADE,
    source      TEXT NOT NULL,
    concept_id  TEXT NOT NULL,
    review      TEXT NOT NULL DEFAULT 'pending' CHECK (review IN ('pending', 'ok', 'issue')),
    note        TEXT,
    PRIMARY KEY (batch_id, concept_id)
);
```
Re-run `docker compose run --rm flyway`. Expected: "Successfully applied 1 migration" (V2).

- [ ] **Step 1: Write the failing test** `etl/tests/test_load_products.py`
```python
import json, pathlib
import psycopg, pytest
from testcontainers.postgres import PostgresContainer
from bddrug_etl.load.products import load_products

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIX = json.loads((pathlib.Path(__file__).parent / "fixtures/tericin.json").read_text())

@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c

def count(conn, table):
    return conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

def test_loads_product_raw_and_ingredients(conn):
    stats = load_products(conn, [FIX, {**FIX, "id": "x", "concept_class": "Ingredient"}])
    assert (stats.seen, stats.loaded, stats.skipped) == (2, 1, 1)
    assert count(conn, "curated.brand_product") == 1
    assert count(conn, "raw.ocl_concept") == 2
    assert conn.execute("SELECT xm_code FROM curated.brand_product_ingredient").fetchall() == [("XM5TR4",)]

def test_rerun_is_idempotent_and_replaces_ingredients(conn):
    changed = {**FIX, "mappings": [{**FIX["mappings"][0], "to_concept_code": "XM0000", "to_concept_name": "New"}]}
    load_products(conn, [FIX])
    load_products(conn, [changed])
    assert count(conn, "curated.brand_product") == 1
    assert conn.execute("SELECT xm_code FROM curated.brand_product_ingredient").fetchall() == [("XM0000",)]
```

- [ ] **Step 2: Run to verify it fails**
Run: `pytest tests/test_load_products.py -v` (Docker must be running)
Expected: FAIL with `ModuleNotFoundError: No module named 'bddrug_etl.load'`

- [ ] **Step 3: Implement** `etl/src/bddrug_etl/load/products.py`
```python
"""Idempotent upsert of DGDA concepts into raw + curated tables."""
from collections.abc import Iterable
from dataclasses import dataclass

import psycopg
from psycopg.types.json import Jsonb

from bddrug_etl.ocl.transform import concept_to_product


@dataclass(frozen=True)
class LoadStats:
    seen: int
    loaded: int
    skipped: int


def load_products(conn: psycopg.Connection, concepts: Iterable[dict], source: str = "DGDA-Drugs") -> LoadStats:
    seen = loaded = 0
    with conn.cursor() as cur:
        for concept in concepts:
            seen += 1
            cur.execute(
                """INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES (%s, %s, %s)
                   ON CONFLICT (source, concept_id) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()""",
                (source, concept["id"], Jsonb(concept)),
            )
            product = concept_to_product(concept)
            if product is None:
                continue
            cur.execute(
                """INSERT INTO curated.brand_product
                     (concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (concept_id) DO UPDATE SET
                     dar_number = EXCLUDED.dar_number, trade_name = EXCLUDED.trade_name, company = EXCLUDED.company,
                     dosage_form = EXCLUDED.dosage_form, generic_content_raw = EXCLUDED.generic_content_raw,
                     quality_flag = EXCLUDED.quality_flag, updated_at = now()""",
                (product.concept_id, product.dar_number, product.trade_name, product.company,
                 product.dosage_form, product.generic_content_raw, product.quality_flag),
            )
            cur.execute("DELETE FROM curated.brand_product_ingredient WHERE concept_id = %s", (product.concept_id,))
            cur.executemany(
                "INSERT INTO curated.brand_product_ingredient (concept_id, xm_code, ingredient_name) VALUES (%s, %s, %s)",
                [(product.concept_id, i.xm_code, i.name) for i in product.ingredients],
            )
            loaded += 1
            if loaded % 500 == 0:
                conn.commit()
    conn.commit()
    return LoadStats(seen=seen, loaded=loaded, skipped=seen - loaded)
```

- [ ] **Step 4: Run to verify it passes**
Run: `pytest tests/test_load_products.py -v`
Expected: 2 passed

- [ ] **Step 5: Write the failing batch test** `etl/tests/test_batches.py`
```python
import json, pathlib
import psycopg, pytest
from testcontainers.postgres import PostgresContainer
from bddrug_etl.load.batches import read_batch_file, run_batch

ROOT = pathlib.Path(__file__).resolve().parents[2]
FIX = json.loads((pathlib.Path(__file__).parent / "fixtures/tericin.json").read_text())

class FakeClient:
    def get_concept(self, owner, source, concept_id):
        return FIX if concept_id == FIX["id"] else None

@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c

def test_read_batch_file_ignores_comments_blanks_and_duplicates(tmp_path):
    f = tmp_path / "0001-pilot.txt"
    f.write_text("# pilot\n341-0160-020--tericin\n\n  341-0160-020--tericin  # dup\nabc\n")
    assert read_batch_file(f) == ["341-0160-020--tericin", "abc"]

def test_missing_concept_is_recorded_as_issue_and_rest_loads(conn):
    stats = run_batch(conn, FakeClient(), "0001-pilot", [FIX["id"], "typo-id"])
    assert (stats.seen, stats.loaded) == (1, 1)
    rows = dict(conn.execute("SELECT concept_id, review FROM ops.batch_item WHERE batch_id='0001-pilot'").fetchall())
    assert rows == {FIX["id"]: "pending", "typo-id": "issue"}
    note = conn.execute("SELECT note FROM ops.batch_item WHERE concept_id='typo-id'").fetchone()[0]
    assert note == "not found at source"
    assert conn.execute("SELECT item_count, status FROM ops.batch WHERE batch_id='0001-pilot'").fetchone() == (2, "in_review")

def test_rerun_resets_review_to_pending(conn):
    conn.execute("UPDATE ops.batch_item SET review='ok' WHERE concept_id=%s", (FIX["id"],))
    run_batch(conn, FakeClient(), "0001-pilot", [FIX["id"]])
    assert conn.execute("SELECT review FROM ops.batch_item WHERE batch_id='0001-pilot'").fetchall() == [("pending",)]
```
The re-run test exists because re-extracted data must be reviewed again; an old `ok` must never carry over to new data.

- [ ] **Step 6: Run to verify it fails**
Run: `pytest tests/test_batches.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'bddrug_etl.load.batches'`

- [ ] **Step 7: Implement** `etl/src/bddrug_etl/load/batches.py`
```python
"""Batch runs: fetch an explicit list of DGDA concepts, load them, and record per-item review status."""
import pathlib

import psycopg

from bddrug_etl.load.products import LoadStats, load_products

OWNER, SOURCE = "MoHFW", "DGDA-Drugs"


def read_batch_file(path: pathlib.Path) -> list[str]:
    ids: list[str] = []
    for line in path.read_text().splitlines():
        concept_id = line.split("#", 1)[0].strip()
        if concept_id and concept_id not in ids:
            ids.append(concept_id)
    return ids


def run_batch(conn: psycopg.Connection, client, batch_id: str, concept_ids: list[str]) -> LoadStats:
    found, missing = [], []
    for concept_id in concept_ids:
        concept = client.get_concept(OWNER, SOURCE, concept_id)
        (found.append(concept) if concept else missing.append(concept_id))
    stats = load_products(conn, found, source=SOURCE)
    with conn.cursor() as cur:
        cur.execute("DELETE FROM ops.batch WHERE batch_id = %s", (batch_id,))
        cur.execute("INSERT INTO ops.batch (batch_id, item_count) VALUES (%s, %s)", (batch_id, len(concept_ids)))
        cur.executemany(
            "INSERT INTO ops.batch_item (batch_id, source, concept_id) VALUES (%s, %s, %s)",
            [(batch_id, SOURCE, c["id"]) for c in found],
        )
        cur.executemany(
            "INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note) VALUES (%s, %s, %s, 'issue', 'not found at source')",
            [(batch_id, SOURCE, concept_id) for concept_id in missing],
        )
    conn.commit()
    return stats
```

- [ ] **Step 8: Run to verify it passes**
Run: `pytest tests/test_batches.py tests/test_load_products.py -v`
Expected: 5 passed

- [ ] **Step 9: CLI** `etl/src/bddrug_etl/jobs/load_dgda.py`
```python
"""CLI: load one batch of DGDA concepts from the national OCL server."""
import argparse, logging, os, pathlib

import httpx, psycopg

from bddrug_etl.load.batches import read_batch_file, run_batch
from bddrug_etl.ocl.client import OclClient

log = logging.getLogger("load_dgda")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Load a batch of DGDA registered products from OCL")
    parser.add_argument("--batch", type=pathlib.Path, required=True, help="batches/NNNN-name.txt")
    args = parser.parse_args()
    ids = read_batch_file(args.batch)
    base = os.environ.get("OCL_BASE_URL", "https://api.tr.ocl.dghs.gov.bd")
    with httpx.Client(headers={"User-Agent": "bddrug-etl/0.1 (+niramoy)"}) as http, \
            psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        stats = run_batch(conn, OclClient(base, http), args.batch.stem, ids)
    log.info("batch=%s requested=%d loaded=%d missing=%d", args.batch.stem, len(ids), stats.loaded, len(ids) - stats.seen)


if __name__ == "__main__":
    main()
```
Also create the empty `__init__.py` files for `load` and `jobs`.

- [ ] **Step 10: Dockerfile** `etl/Dockerfile`
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY src ./src
RUN pip install --no-cache-dir .
USER 1000
ENTRYPOINT ["bddrug-etl"]
```
Batch files are not baked into the image. Compose mounts `../batches` read-only at `/app/batches` (Task 7), so a new batch needs only a `git pull` on the VM.

- [ ] **Step 11: Choose the pilot 10 with the pharmacist**
Find candidate concept IDs on OCL, one search per medicine, read-only:
```bash
curl -s 'https://api.tr.ocl.dghs.gov.bd/orgs/MoHFW/sources/DGDA-Drugs/concepts/?q=napa&limit=5' \
  | python3 -c "import sys,json;[print(c['id'],'|',c['display_name']) for c in json.load(sys.stdin)]"
```
Repeat for amlodipine, warfarin, aspirin, clarithromycin, simvastatin, amoxicillin clavulanic, chloramphenicol eye, domperidone and metformin. The pharmacist confirms one brand each. Write `batches/0001-pilot.txt` with one ID per line and a `# reason` comment, for example:
```
# 0001-pilot: 10 edge-case medicines chosen with <pharmacist name>
341-0160-020--tericin   # placeholder line: replace with the confirmed Napa ID
```
The final file must hold exactly the 10 confirmed IDs; the Tericin line above is only a format example.

- [ ] **Step 12: Run the pilot batch locally**
Run: `cd deploy && docker compose up -d db && docker compose run --rm flyway && cd .. && DATABASE_URL=postgresql://bddrug:change-me@localhost:5432/bddrug bddrug-etl --batch batches/0001-pilot.txt`
(Temporarily publish db port `5432:5432` in a local `docker-compose.override.yml`; never in prod.)
Expected: `batch=0001-pilot requested=10 loaded=10 missing=0`

- [ ] **Step 13: Commit**
```bash
git add db etl batches && git commit -m "feat(etl): batch-scoped DGDA loader with per-item review status"
```

---

### Task 5: Products API (search + detail)

**Files:**
- Create: `api/settings.gradle.kts`, `api/build.gradle.kts`, `api/Dockerfile`, `api/src/main/resources/application.yml`, the domain/application/adapter/presentation classes listed in the file structure
- Test: `api/src/test/java/com/niramoy/bddrug/ProductQueryServiceTest.java`, `api/src/test/java/com/niramoy/bddrug/ProductApiIntegrationTest.java`

**Interfaces:**
- Consumes: `curated.brand_product`, `curated.brand_product_ingredient`
- Produces:
  - `GET /v1/products?q={2..100 chars}&page={0..500}` → `ApiResponse<List<Product>>`, 20 per page, ingredients empty in the list view
  - `GET /v1/products/{conceptId}` → `ApiResponse<Product>` with ingredients, or 404
  - `Product(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, List<Ingredient> ingredients)`, `Ingredient(xmCode, name)`

- [ ] **Step 1: Gradle setup** `api/settings.gradle.kts`: `rootProject.name = "bddrug-api"`. `api/build.gradle.kts`:
```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.4.2"
    id("io.spring.dependency-management") version "1.1.7"
}
group = "com.niramoy"
java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
repositories { mavenCentral() }
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("org.springframework.boot:spring-boot-starter-data-r2dbc")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    runtimeOnly("org.postgresql:r2dbc-postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("io.projectreactor:reactor-test")
    testImplementation("org.testcontainers:postgresql:1.20.4")
    testImplementation("org.testcontainers:junit-jupiter:1.20.4")
    testImplementation("org.flywaydb:flyway-core:10.20.1")
    testImplementation("org.flywaydb:flyway-database-postgresql:10.20.1")
    testRuntimeOnly("org.postgresql:postgresql:42.7.4")
}
tasks.test { useJUnitPlatform() }
```
Create the wrapper: `cd api && gradle wrapper --gradle-version 8.11.1`.

`api/src/main/resources/application.yml`:
```yaml
spring:
  application.name: bddrug-api
  r2dbc:
    url: ${DB_R2DBC_URL:r2dbc:postgresql://localhost:5432/bddrug}
    username: ${DB_USER:bddrug}
    password: ${DB_PASSWORD:change-me}
server.port: 8080
management.endpoints.web.exposure.include: health
```

- [ ] **Step 2: Write the failing unit test** `ProductQueryServiceTest.java`
```java
package com.niramoy.bddrug;

import com.niramoy.bddrug.application.InvalidQueryException;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.domain.Product;
import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;
import java.util.ArrayList;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class ProductQueryServiceTest {
    static class FakePort implements ProductQueryPort {
        final List<Object[]> calls = new ArrayList<>();
        public Flux<Product> search(String term, int limit, int offset) { calls.add(new Object[]{term, limit, offset}); return Flux.empty(); }
        public Mono<Product> findByConceptId(String id) { return Mono.empty(); }
    }

    @Test void rejectsTooShortQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search(" a ", 0))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsTooLongQuery() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search("x".repeat(101), 0))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void rejectsPageOutOfRange() {
        StepVerifier.create(new ProductQueryService(new FakePort()).search("napa", 501))
            .expectError(InvalidQueryException.class).verify();
        StepVerifier.create(new ProductQueryService(new FakePort()).search("napa", -1))
            .expectError(InvalidQueryException.class).verify();
    }
    @Test void trimsLowercasesAndPagesBy20() {
        FakePort port = new FakePort();
        StepVerifier.create(new ProductQueryService(port).search("  NaPa ", 2)).verifyComplete();
        assertThat(port.calls.get(0)).containsExactly("napa", 20, 40);
    }
}
```

- [ ] **Step 3: Run to verify it fails**
Run: `cd api && ./gradlew test --tests '*ProductQueryServiceTest*'`
Expected: FAIL, compilation errors for the missing classes.

- [ ] **Step 4: Implement domain, port and service**
`domain/Ingredient.java`:
```java
package com.niramoy.bddrug.domain;
public record Ingredient(String xmCode, String name) {}
```
`domain/Product.java`:
```java
package com.niramoy.bddrug.domain;
import java.util.List;
public record Product(String conceptId, String darNumber, String tradeName, String company, String dosageForm,
                      String genericContentRaw, String qualityFlag, List<Ingredient> ingredients) {
    public Product withIngredients(List<Ingredient> list) {
        return new Product(conceptId, darNumber, tradeName, company, dosageForm, genericContentRaw, qualityFlag, list);
    }
}
```
`application/port/ProductQueryPort.java`:
```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Product;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
public interface ProductQueryPort {
    Flux<Product> search(String normalisedTerm, int limit, int offset);
    Mono<Product> findByConceptId(String conceptId);
}
```
`application/InvalidQueryException.java`:
```java
package com.niramoy.bddrug.application;
public class InvalidQueryException extends RuntimeException {
    public InvalidQueryException(String message) { super(message); }
}
```
`application/ProductQueryService.java`:
```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.domain.Product;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.Locale;

@Service
public class ProductQueryService {
    public static final int PAGE_SIZE = 20, MAX_PAGE = 500, MIN_LEN = 2, MAX_LEN = 100;
    private final ProductQueryPort port;
    public ProductQueryService(ProductQueryPort port) { this.port = port; }

    public Flux<Product> search(String q, int page) {
        String term = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (term.length() < MIN_LEN || term.length() > MAX_LEN)
            return Flux.error(new InvalidQueryException("q must be 2-100 characters"));
        if (page < 0 || page > MAX_PAGE)
            return Flux.error(new InvalidQueryException("page must be 0-500"));
        return port.search(term, PAGE_SIZE, page * PAGE_SIZE);
    }

    public Mono<Product> get(String conceptId) { return port.findByConceptId(conceptId); }
}
```

- [ ] **Step 5: Run the unit test to verify it passes**
Run: `./gradlew test --tests '*ProductQueryServiceTest*'`
Expected: 4 tests PASS

- [ ] **Step 6: Write the failing integration test** `ProductApiIntegrationTest.java`
```java
package com.niramoy.bddrug;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.sql.DriverManager;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class ProductApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource static void props(DynamicPropertyRegistry r) {
        r.add("spring.r2dbc.url", () -> "r2dbc:postgresql://" + pg.getHost() + ":" + pg.getFirstMappedPort() + "/" + pg.getDatabaseName());
        r.add("spring.r2dbc.username", pg::getUsername);
        r.add("spring.r2dbc.password", pg::getPassword);
    }

    @BeforeAll static void seed() throws Exception {
        Flyway.configure().dataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())
            .locations("filesystem:../db/migrations").load().migrate();
        try (var c = DriverManager.getConnection(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword()); var s = c.createStatement()) {
            s.execute("""
                INSERT INTO curated.brand_product VALUES
                 ('341-0160-020--tericin','341-0160-020','Tericin','Beacon Pharmaceuticals PLC','Injection','Amphotericin B 50 mg/vial',NULL,now()),
                 ('000-0000-001--pct-100','000-0000-001','PCT 100% Max','Test Pharma','Tablet','Paracetamol 500 mg',NULL,now()),
                 ('000-0000-002--no-map','000-0000-002','Nomap','Test Pharma','Cream','Unknown herb',NULL,now());
                INSERT INTO curated.brand_product_ingredient VALUES ('341-0160-020--tericin','XM5TR4','Amphotericin B');
                """);
        }
    }

    @Autowired WebTestClient web;

    @Test void searchesByIngredientTextCaseInsensitive() {
        web.get().uri("/v1/products?q=AMPHOTERICIN").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.success").isEqualTo(true)
            .jsonPath("$.data[0].tradeName").isEqualTo("Tericin")
            .jsonPath("$.metadata.requestId").exists();
    }
    @Test void wildcardCharactersAreLiteral() {
        web.get().uri("/v1/products?q=%25%25").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(0);
        web.get().uri("/v1/products?q=100%25").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data[0].tradeName").isEqualTo("PCT 100% Max");
    }
    @Test void bengaliQueryReturnsEmptyNotError() {
        web.get().uri("/v1/products?q={q}", "নাপা").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.length()").isEqualTo(0);
    }
    @Test void shortQueryIs400WithEnvelope() {
        web.get().uri("/v1/products?q=a").exchange().expectStatus().isBadRequest()
            .expectBody().jsonPath("$.success").isEqualTo(false)
            .jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY");
    }
    @Test void detailIncludesIngredients() {
        web.get().uri("/v1/products/341-0160-020--tericin").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.ingredients[0].xmCode").isEqualTo("XM5TR4");
    }
    @Test void detailWithoutMappingHasEmptyIngredients() {
        web.get().uri("/v1/products/000-0000-002--no-map").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data.ingredients.length()").isEqualTo(0);
    }
    @Test void unknownProductIs404() {
        web.get().uri("/v1/products/does-not-exist").exchange().expectStatus().isNotFound()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("NOT_FOUND");
    }
}
```

- [ ] **Step 7: Run to verify it fails**
Run: `./gradlew test --tests '*ProductApiIntegrationTest*'`
Expected: FAIL, because the application context has no `ProductQueryPort` bean and no controller.

- [ ] **Step 8: Implement the adapter, controller, envelope and error handler**
`adapter/persistence/R2dbcProductAdapter.java`:
```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.ProductQueryPort;
import com.niramoy.bddrug.domain.Ingredient;
import com.niramoy.bddrug.domain.Product;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.util.List;

@Component
public class R2dbcProductAdapter implements ProductQueryPort {
    private static final String COLS = "concept_id, dar_number, trade_name, company, dosage_form, generic_content_raw, quality_flag";
    private final DatabaseClient db;
    public R2dbcProductAdapter(DatabaseClient db) { this.db = db; }

    static String likePattern(String term) {
        return "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    @Override public Flux<Product> search(String term, int limit, int offset) {
        return db.sql("SELECT " + COLS + " FROM curated.brand_product " +
                      "WHERE lower(trade_name) LIKE :p ESCAPE '\\' OR lower(generic_content_raw) LIKE :p ESCAPE '\\' " +
                      "ORDER BY (lower(trade_name) LIKE :p ESCAPE '\\') DESC, trade_name, concept_id LIMIT :limit OFFSET :offset")
            .bind("p", likePattern(term)).bind("limit", limit).bind("offset", offset)
            .map(R2dbcProductAdapter::toProduct).all();
    }

    @Override public Mono<Product> findByConceptId(String conceptId) {
        Mono<Product> product = db.sql("SELECT " + COLS + " FROM curated.brand_product WHERE concept_id = :id")
            .bind("id", conceptId).map(R2dbcProductAdapter::toProduct).one();
        Mono<List<Ingredient>> ingredients = db.sql(
                "SELECT xm_code, ingredient_name FROM curated.brand_product_ingredient WHERE concept_id = :id ORDER BY xm_code")
            .bind("id", conceptId).map(r -> new Ingredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class)))
            .all().collectList();
        return product.zipWith(ingredients, Product::withIngredients);
    }

    private static Product toProduct(Readable r) {
        return new Product(r.get("concept_id", String.class), r.get("dar_number", String.class), r.get("trade_name", String.class),
            r.get("company", String.class), r.get("dosage_form", String.class), r.get("generic_content_raw", String.class),
            r.get("quality_flag", String.class), List.of());
    }
}
```
`presentation/ApiResponse.java`:
```java
package com.niramoy.bddrug.presentation;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
public record ApiResponse<T>(boolean success, T data, String message, List<ApiError> errors, Metadata metadata) {
    public record ApiError(String field, String code, String message) {}
    public record Metadata(Instant timestamp, String requestId) {}
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, "OK", List.of(), new Metadata(Instant.now(), UUID.randomUUID().toString()));
    }
    public static ApiResponse<Void> error(String code, String field, String message) {
        return new ApiResponse<>(false, null, message, List.of(new ApiError(field, code, message)),
            new Metadata(Instant.now(), UUID.randomUUID().toString()));
    }
}
```
`presentation/ProductController.java`:
```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.ProductQueryService;
import com.niramoy.bddrug.domain.Product;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;
import java.util.List;

@RestController
@RequestMapping("/v1/products")
public class ProductController {
    private final ProductQueryService service;
    public ProductController(ProductQueryService service) { this.service = service; }

    @GetMapping
    public Mono<ApiResponse<List<Product>>> search(@RequestParam(defaultValue = "") String q,
                                                   @RequestParam(defaultValue = "0") int page) {
        return service.search(q, page).collectList().map(ApiResponse::ok);
    }

    @GetMapping("/{conceptId}")
    public Mono<ApiResponse<Product>> get(@PathVariable String conceptId) {
        return service.get(conceptId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found")));
    }
}
```
`presentation/ApiExceptionHandler.java`:
```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.InvalidQueryException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebInputException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(InvalidQueryException.class)
    ResponseEntity<ApiResponse<Void>> invalid(InvalidQueryException e) {
        return ResponseEntity.badRequest().body(ApiResponse.error("INVALID_QUERY", "q", e.getMessage()));
    }
    @ExceptionHandler(ServerWebInputException.class)
    ResponseEntity<ApiResponse<Void>> badInput(ServerWebInputException e) {
        return ResponseEntity.badRequest().body(ApiResponse.error("INVALID_QUERY", null, "Invalid request parameter"));
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiResponse<Void>> status(ResponseStatusException e) {
        String code = e.getStatusCode().value() == 404 ? "NOT_FOUND" : "ERROR";
        return ResponseEntity.status(e.getStatusCode()).body(ApiResponse.error(code, null, e.getReason()));
    }
}
```
`BddrugApiApplication.java` (package `com.niramoy.bddrug`): the standard `@SpringBootApplication` main class.

- [ ] **Step 9: Run all API tests**
Run: `./gradlew test`
Expected: 11 tests PASS (4 unit, 7 integration)

- [ ] **Step 10: Dockerfile** `api/Dockerfile`
```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN ./gradlew bootJar -x test --no-daemon
FROM eclipse-temurin:21-jre
COPY --from=build /src/build/libs/*.jar /app.jar
USER 1000
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

- [ ] **Step 11: Commit**
```bash
git add api && git commit -m "feat(api): product search and detail endpoints"
```

---

### Task 6: Server-rendered browse site

**Files:**
- Create: `web/package.json`, `web/next.config.ts`, `web/tsconfig.json`, `web/vitest.config.ts`, `web/lib/api.ts`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/app/products/[id]/page.tsx`, `web/Dockerfile`
- Test: `web/tests/api.test.ts`

**Interfaces:**
- Consumes: `GET /v1/products`, `GET /v1/products/{id}` at `process.env.API_URL` (internal, e.g. `http://api:8080`)
- Produces: `searchProducts(q: string, page: number): Promise<SearchResult>`, `getProduct(id: string): Promise<Product | null>`; pages `/` and `/products/[id]`

- [ ] **Step 1: Scaffold** `web/package.json`
```json
{
  "name": "bddrug-web",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start -p 3000", "test": "vitest run" },
  "dependencies": { "next": "15.1.6", "react": "19.0.0", "react-dom": "19.0.0", "server-only": "0.0.1" },
  "devDependencies": { "typescript": "5.7.3", "@types/react": "19.0.8", "@types/node": "22.10.7", "vitest": "2.1.8" }
}
```
`web/next.config.ts`:
```ts
import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'" },
    ] }];
  },
};
export default config;
```
`web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" }, resolve: { alias: { "server-only": "/dev/null" } } });
```
Run: `cd web && npm install && npx tsc --init --jsx preserve --module esnext --moduleResolution bundler --strict`

- [ ] **Step 2: Write the failing test** `web/tests/api.test.ts`
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getProduct, searchProducts } from "../lib/api";

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("skips the call for queries under 2 characters", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await searchProducts(" a ", 0)).toEqual({ items: [], error: null });
    expect(f).not.toHaveBeenCalled();
  });
  it("encodes the query and page", async () => {
    const f = vi.fn().mockResolvedValue(ok([])); vi.stubGlobal("fetch", f);
    await searchProducts("100% max", 2);
    expect(f.mock.calls[0][0]).toBe("http://api:8080/v1/products?q=100%25+max&page=2");
  });
  it("returns a readable error on API 400", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: false, errors: [{ message: "q must be 2-100 characters" }] }), { status: 400 })));
    expect(await searchProducts("zz", 0)).toEqual({ items: [], error: "q must be 2-100 characters" });
  });
  it("returns null for unknown product", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    expect(await getProduct("nope")).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**
Run: `API_URL=http://api:8080 npm test`
Expected: FAIL, `Failed to resolve import "../lib/api"`

- [ ] **Step 4: Implement** `web/lib/api.ts`
```ts
import "server-only";

export type Ingredient = { xmCode: string; name: string };
export type Product = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string;
  genericContentRaw: string; qualityFlag: string | null; ingredients: Ingredient[];
};
export type SearchResult = { items: Product[]; error: string | null };

const base = () => process.env.API_URL ?? "http://api:8080";

export async function searchProducts(q: string, page: number): Promise<SearchResult> {
  const term = q.trim();
  if (term.length < 2) return { items: [], error: null };
  const params = new URLSearchParams({ q: term, page: String(page) });
  const res = await fetch(`${base()}/v1/products?${params}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { items: [], error: body?.errors?.[0]?.message ?? "Search failed" };
  return { items: body.data ?? [], error: null };
}

export async function getProduct(id: string): Promise<Product | null> {
  const res = await fetch(`${base()}/v1/products/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Product;
}
```

- [ ] **Step 5: Run to verify it passes**
Run: `API_URL=http://api:8080 npm test`
Expected: 4 passed

- [ ] **Step 6: Pages.** These are server components only; no `"use client"` anywhere.
`web/app/layout.tsx`:
```tsx
export const metadata = { title: "BDDrug KB preview", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <header><a href="/"><strong>BDDrug KB</strong></a> <small>preview: data may be incomplete</small></header>
        <main>{children}</main>
      </body>
    </html>
  );
}
```
`web/app/page.tsx`:
```tsx
import { searchProducts } from "@/lib/api";
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page = "0" } = await searchParams;
  const pageNum = Math.max(0, Number.parseInt(page, 10) || 0);
  const { items, error } = await searchProducts(q, pageNum);
  return (
    <>
      <form method="get" role="search">
        <input name="q" defaultValue={q} placeholder="Brand or ingredient, e.g. napa, amphotericin" minLength={2} maxLength={100} />
        <button type="submit">Search</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {q.trim().length >= 2 && !error && items.length === 0 && <p>No products found.</p>}
      <ul>
        {items.map((p) => (
          <li key={p.conceptId}>
            <a href={`/products/${encodeURIComponent(p.conceptId)}`}>{p.tradeName}</a>{" "}
            {p.dosageForm}: {p.genericContentRaw} <small>({p.company})</small>
          </li>
        ))}
      </ul>
      {items.length === 20 && <a href={`/?q=${encodeURIComponent(q)}&page=${pageNum + 1}`}>Next page</a>}
    </>
  );
}
```
`web/app/products/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/api";
export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProduct(decodeURIComponent(id));
  if (!p) notFound();
  return (
    <article>
      <h1>{p.tradeName}</h1>
      <dl>
        <dt>DAR number</dt><dd>{p.darNumber}</dd>
        <dt>Company</dt><dd>{p.company}</dd>
        <dt>Dosage form</dt><dd>{p.dosageForm}</dd>
        <dt>Generic content (as registered)</dt><dd>{p.genericContentRaw}</dd>
        {p.qualityFlag && (<><dt>DGDA quality flag</dt><dd>{p.qualityFlag}</dd></>)}
      </dl>
      <h2>Active ingredients</h2>
      {p.ingredients.length === 0
        ? <p>No ingredient mapping from DGDA.</p>
        : <ul>{p.ingredients.map((i) => <li key={i.xmCode}>{i.name} <code>ICD-11 {i.xmCode}</code></li>)}</ul>}
      <p><small>Source: DGDA register via national OCL terminology server.</small></p>
    </article>
  );
}
```
Add `"paths": {"@/*": ["./*"]}` under `compilerOptions` in `tsconfig.json`.

- [ ] **Step 7: Build to verify pages compile**
Run: `npm run build`
Expected: "Compiled successfully". Routes `/` and `/products/[id]` are listed as dynamic (ƒ).

- [ ] **Step 8: Dockerfile** `web/Dockerfile`
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 9: Commit**
```bash
git add web && git commit -m "feat(web): SSR product search and detail pages"
```

---

### Task 6A: Batch evidence view (raw source beside extracted data)

**Files:**
- Create (api): `domain/Batch.java`, `domain/BatchItem.java`, `application/port/BatchQueryPort.java`, `adapter/persistence/R2dbcBatchAdapter.java`, `presentation/BatchController.java`
- Modify (api test): `ProductApiIntegrationTest.java` (seed raw + ops rows; add batch tests)
- Create (web): `app/batches/page.tsx`, `app/batches/[id]/page.tsx`, `lib/evidence.ts`
- Modify (web): `lib/api.ts` (add `listBatches`, `getBatch`), `app/layout.tsx` (nav link "Batches")
- Test (web): `tests/evidence.test.ts`

**Interfaces:**
- Consumes: `ops.batch`, `ops.batch_item`, `raw.ocl_concept`, `curated.brand_product(_ingredient)`, `Product`, `Ingredient`
- Produces:
  - `GET /v1/batches` → `ApiResponse<List<Batch>>` (items empty)
  - `GET /v1/batches/{batchId}` → `ApiResponse<Batch>` with items, or 404
  - `Batch(batchId, status, runAt: Instant, itemCount, List<BatchItem> items)`
  - `BatchItem(conceptId, review, note, Product extracted /* null if not found */, String sourceJson /* null if not fetched */)`
  - web: `summariseSource(sourceJson: string | null): SourceSummary | null`

- [ ] **Step 1: Write the failing API tests.** In `ProductApiIntegrationTest.seed()`, append to the SQL text block:
```sql
INSERT INTO raw.ocl_concept (source, concept_id, payload) VALUES ('DGDA-Drugs','341-0160-020--tericin',
  '{"id":"341-0160-020--tericin","extras":{"trade_name":"Tericin","generic_content_raw":"Amphotericin B  50 mg/vial"},"mappings":[{"map_type":"Has-active-ingredient","to_concept_code":"XM5TR4","to_concept_name":"Amphotericin B"}]}');
INSERT INTO ops.batch (batch_id, item_count) VALUES ('0001-pilot', 2);
INSERT INTO ops.batch_item (batch_id, source, concept_id) VALUES ('0001-pilot','DGDA-Drugs','341-0160-020--tericin');
INSERT INTO ops.batch_item (batch_id, source, concept_id, review, note) VALUES ('0001-pilot','DGDA-Drugs','typo-id','issue','not found at source');
```
Add the tests:
```java
    @Test void batchShowsSourceBesideExtractedData() {
        web.get().uri("/v1/batches/0001-pilot").exchange().expectStatus().isOk()
            .expectBody()
            .jsonPath("$.data.itemCount").isEqualTo(2)
            .jsonPath("$.data.items[0].conceptId").isEqualTo("341-0160-020--tericin")
            .jsonPath("$.data.items[0].extracted.genericContentRaw").isEqualTo("Amphotericin B 50 mg/vial")
            .jsonPath("$.data.items[0].extracted.ingredients[0].xmCode").isEqualTo("XM5TR4")
            .jsonPath("$.data.items[0].sourceJson").value(s -> org.assertj.core.api.Assertions.assertThat((String) s).contains("Amphotericin B  50 mg/vial"))
            .jsonPath("$.data.items[1].conceptId").isEqualTo("typo-id")
            .jsonPath("$.data.items[1].review").isEqualTo("issue")
            .jsonPath("$.data.items[1].extracted").doesNotExist();
    }
    @Test void batchListAndUnknownBatch() {
        web.get().uri("/v1/batches").exchange().expectStatus().isOk()
            .expectBody().jsonPath("$.data[0].batchId").isEqualTo("0001-pilot");
        web.get().uri("/v1/batches/nope").exchange().expectStatus().isNotFound();
    }
```
`items[0]` sorts before `typo-id` because `'3' < 't'`; the adapter orders by `concept_id`.

- [ ] **Step 2: Run to verify they fail**
Run: `cd api && ./gradlew test --tests '*ProductApiIntegrationTest*'`
Expected: the 2 new tests FAIL with 404 (no batch endpoints); the existing 7 still pass.

- [ ] **Step 3: Implement the domain and port**
```java
// domain/BatchItem.java
package com.niramoy.bddrug.domain;
public record BatchItem(String conceptId, String review, String note, Product extracted, String sourceJson) {}
```
```java
// domain/Batch.java
package com.niramoy.bddrug.domain;
import java.time.Instant;
import java.util.List;
public record Batch(String batchId, String status, Instant runAt, int itemCount, List<BatchItem> items) {
    public Batch withItems(List<BatchItem> list) { return new Batch(batchId, status, runAt, itemCount, list); }
}
```
```java
// application/port/BatchQueryPort.java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.Batch;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
public interface BatchQueryPort {
    Flux<Batch> list();
    Mono<Batch> find(String batchId);
}
```

- [ ] **Step 4: Implement the adapter** `adapter/persistence/R2dbcBatchAdapter.java`
```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.*;
import io.r2dbc.spi.Readable;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.time.OffsetDateTime;
import java.util.*;

@Component
public class R2dbcBatchAdapter implements BatchQueryPort {
    private final DatabaseClient db;
    public R2dbcBatchAdapter(DatabaseClient db) { this.db = db; }

    private static Batch toBatch(Readable r) {
        return new Batch(r.get("batch_id", String.class), r.get("status", String.class),
            r.get("run_at", OffsetDateTime.class).toInstant(), r.get("item_count", Integer.class), List.of());
    }

    @Override public Flux<Batch> list() {
        return db.sql("SELECT batch_id, status, run_at, item_count FROM ops.batch ORDER BY run_at DESC")
            .map(R2dbcBatchAdapter::toBatch).all();
    }

    @Override public Mono<Batch> find(String batchId) {
        Mono<Batch> batch = db.sql("SELECT batch_id, status, run_at, item_count FROM ops.batch WHERE batch_id = :id")
            .bind("id", batchId).map(R2dbcBatchAdapter::toBatch).one();
        Mono<HashMap<String, List<Ingredient>>> ingredients = db.sql("""
                SELECT i.concept_id, i.xm_code, i.ingredient_name FROM curated.brand_product_ingredient i
                JOIN ops.batch_item bi ON bi.concept_id = i.concept_id WHERE bi.batch_id = :id ORDER BY i.xm_code""")
            .bind("id", batchId)
            .map(r -> Map.entry(r.get("concept_id", String.class),
                                new Ingredient(r.get("xm_code", String.class), r.get("ingredient_name", String.class))))
            .all()
            .collect(() -> new HashMap<String, List<Ingredient>>(),
                     (m, e) -> m.computeIfAbsent(e.getKey(), k -> new ArrayList<>()).add(e.getValue()));
        Mono<List<BatchItem>> items = ingredients.flatMap(ing -> db.sql("""
                SELECT bi.concept_id, bi.review, bi.note, rc.payload::text AS source_json,
                       bp.concept_id AS p_id, bp.dar_number, bp.trade_name, bp.company, bp.dosage_form,
                       bp.generic_content_raw, bp.quality_flag
                FROM ops.batch_item bi
                LEFT JOIN raw.ocl_concept rc ON rc.source = bi.source AND rc.concept_id = bi.concept_id
                LEFT JOIN curated.brand_product bp ON bp.concept_id = bi.concept_id
                WHERE bi.batch_id = :id ORDER BY bi.concept_id""")
            .bind("id", batchId)
            .map(r -> {
                String pid = r.get("p_id", String.class);
                Product p = pid == null ? null : new Product(pid, r.get("dar_number", String.class),
                    r.get("trade_name", String.class), r.get("company", String.class), r.get("dosage_form", String.class),
                    r.get("generic_content_raw", String.class), r.get("quality_flag", String.class),
                    ing.getOrDefault(pid, List.of()));
                return new BatchItem(r.get("concept_id", String.class), r.get("review", String.class),
                    r.get("note", String.class), p, r.get("source_json", String.class));
            }).all().collectList());
        return batch.zipWith(items, Batch::withItems);
    }
}
```

- [ ] **Step 5: Implement the controller** `presentation/BatchController.java`
```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.port.BatchQueryPort;
import com.niramoy.bddrug.domain.Batch;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import java.util.List;

@RestController
@RequestMapping("/v1/batches")
public class BatchController {
    private final BatchQueryPort batches;
    public BatchController(BatchQueryPort batches) { this.batches = batches; }

    @GetMapping
    public Mono<ApiResponse<List<Batch>>> list() { return batches.list().collectList().map(ApiResponse::ok); }

    @GetMapping("/{batchId}")
    public Mono<ApiResponse<Batch>> get(@PathVariable String batchId) {
        return batches.find(batchId).map(ApiResponse::ok)
            .switchIfEmpty(Mono.error(new ResponseStatusException(HttpStatus.NOT_FOUND, "Batch not found")));
    }
}
```
This is read-only, so a port is enough and no service is needed. Review actions (ok/issue) arrive in S2 behind login.

- [ ] **Step 6: Run API tests**
Run: `./gradlew test`
Expected: 13 tests PASS

- [ ] **Step 7: Write the failing web test** `web/tests/evidence.test.ts`
```ts
import { describe, expect, it } from "vitest";
import { summariseSource } from "../lib/evidence";

describe("summariseSource", () => {
  it("keeps extras and active-ingredient mappings only, and the OCL link", () => {
    const raw = JSON.stringify({
      id: "341-0160-020--tericin",
      extras: { trade_name: "Tericin", generic_content_raw: "Amphotericin B  50 mg/vial" },
      mappings: [
        { map_type: "Has-active-ingredient", to_concept_code: "XM5TR4", to_concept_name: "Amphotericin B", retired: false, checksums: {} },
        { map_type: "Same-as", to_concept_code: "X", to_concept_name: "Y", retired: false },
      ],
    });
    expect(summariseSource(raw)).toEqual({
      extras: { trade_name: "Tericin", generic_content_raw: "Amphotericin B  50 mg/vial" },
      ingredients: [{ code: "XM5TR4", name: "Amphotericin B", retired: false }],
      oclUrl: "https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/341-0160-020--tericin/",
    });
  });
  it("returns null when there is no source snapshot", () => {
    expect(summariseSource(null)).toBeNull();
  });
});
```

- [ ] **Step 8: Run to verify it fails**
Run: `cd web && npm test`
Expected: FAIL, `Failed to resolve import "../lib/evidence"`

- [ ] **Step 9: Implement** `web/lib/evidence.ts`
```ts
export type SourceSummary = {
  extras: Record<string, unknown>;
  ingredients: { code: string; name: string; retired: boolean }[];
  oclUrl: string;
};

type Mapping = { map_type?: string; to_concept_code?: string; to_concept_name?: string; retired?: boolean };

export function summariseSource(sourceJson: string | null): SourceSummary | null {
  if (!sourceJson) return null;
  const c = JSON.parse(sourceJson) as { id: string; extras?: Record<string, unknown>; mappings?: Mapping[] };
  return {
    extras: c.extras ?? {},
    ingredients: (c.mappings ?? [])
      .filter((m) => m.map_type === "Has-active-ingredient")
      .map((m) => ({ code: m.to_concept_code ?? "", name: m.to_concept_name ?? "", retired: Boolean(m.retired) })),
    oclUrl: `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/${encodeURIComponent(c.id)}/`,
  };
}
```
Retired mappings stay in the summary on purpose, so a reviewer can see what the extractor dropped.

- [ ] **Step 10: Run to verify it passes**
Run: `npm test`
Expected: 6 passed (4 api + 2 evidence)

- [ ] **Step 11: API client additions** (append to `web/lib/api.ts`)
```ts
export type BatchItem = { conceptId: string; review: "pending" | "ok" | "issue"; note: string | null;
  extracted: Product | null; sourceJson: string | null };
export type Batch = { batchId: string; status: string; runAt: string; itemCount: number; items: BatchItem[] };

export async function listBatches(): Promise<Batch[]> {
  const res = await fetch(`${base()}/v1/batches`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch[];
}

export async function getBatch(id: string): Promise<Batch | null> {
  const res = await fetch(`${base()}/v1/batches/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Batch;
}
```

- [ ] **Step 12: Pages.** `web/app/batches/page.tsx`:
```tsx
import { listBatches } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Batches() {
  const batches = await listBatches();
  return (
    <>
      <h1>Batches</h1>
      <table>
        <thead><tr><th>Batch</th><th>Status</th><th>Items</th><th>Run at (UTC)</th></tr></thead>
        <tbody>{batches.map((b) => (
          <tr key={b.batchId}><td><a href={`/batches/${b.batchId}`}>{b.batchId}</a></td><td>{b.status}</td>
            <td>{b.itemCount}</td><td>{b.runAt}</td></tr>))}</tbody>
      </table>
    </>
  );
}
```
`web/app/batches/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import { getBatch } from "@/lib/api";
import { summariseSource } from "@/lib/evidence";
export const dynamic = "force-dynamic";

const cell = { verticalAlign: "top", border: "1px solid #ccc", padding: 8, width: "50%" } as const;

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getBatch(decodeURIComponent(id));
  if (!batch) notFound();
  const issues = batch.items.filter((i) => i.review === "issue").length;
  return (
    <>
      <h1>Batch {batch.batchId}</h1>
      <p>Status: {batch.status} · {batch.itemCount} requested · {issues} issue(s) · run {batch.runAt} UTC</p>
      <p><small>Left: exactly what the DGDA register returned. Right: what we extracted. Report mismatches in the review sheet.</small></p>
      {batch.items.map((item) => {
        const src = summariseSource(item.sourceJson);
        const p = item.extracted;
        return (
          <section key={item.conceptId} id={item.conceptId}>
            <h2>{item.conceptId} <small>[{item.review}{item.note ? `: ${item.note}` : ""}]</small></h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
              <td style={cell}>
                <strong>Source (DGDA via OCL)</strong>
                {src ? (<>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(src.extras, null, 2)}</pre>
                  <ul>{src.ingredients.map((i) => <li key={i.code}>{i.name} <code>{i.code}</code>{i.retired ? " (retired)" : ""}</li>)}</ul>
                  <a href={src.oclUrl} rel="noopener noreferrer" target="_blank">Open original record</a>
                  <details><summary>Full raw JSON</summary><pre style={{ whiteSpace: "pre-wrap" }}>{item.sourceJson}</pre></details>
                </>) : <p>No source snapshot (not found at source).</p>}
              </td>
              <td style={cell}>
                <strong>Extracted</strong>
                {p ? (<dl>
                  <dt>Trade name</dt><dd>{p.tradeName}</dd>
                  <dt>DAR number</dt><dd>{p.darNumber}</dd>
                  <dt>Company</dt><dd>{p.company}</dd>
                  <dt>Dosage form</dt><dd>{p.dosageForm}</dd>
                  <dt>Generic content</dt><dd>{p.genericContentRaw}</dd>
                  <dt>Ingredients</dt><dd>{p.ingredients.length ? p.ingredients.map((i) => `${i.name} (${i.xmCode})`).join(", ") : "none mapped"}</dd>
                </dl>) : <p>Nothing extracted.</p>}
              </td>
            </tr></tbody></table>
          </section>
        );
      })}
    </>
  );
}
```
In `app/layout.tsx`, add `<a href="/batches">Batches</a>` to the header.

- [ ] **Step 13: Build**
Run: `npm run build`
Expected: compiles; `/batches` and `/batches/[id]` are listed as dynamic (ƒ).

- [ ] **Step 14: Commit**
```bash
git add api web && git commit -m "feat(web,api): batch evidence view with raw source beside extracted data"
```

---

### Task 7: Production compose with Traefik (TLS, rate limit, internal-only API)

**Files:**
- Modify: `deploy/docker-compose.yml` (add `api`, `web`, `etl`, `traefik`)

**Interfaces:**
- Consumes: images `ghcr.io/${GHCR_OWNER}/bddrug-{api,web,etl}:${IMAGE_TAG}`
- Produces: the public HTTPS site at `${PREVIEW_DOMAIN}`. Only `web` gets a Traefik router; `api` and `db` sit on the internal network.

- [ ] **Step 1: Add services** to `deploy/docker-compose.yml`
```yaml
  api:
    image: ghcr.io/${GHCR_OWNER}/bddrug-api:${IMAGE_TAG}
    environment:
      DB_R2DBC_URL: r2dbc:postgresql://db:5432/bddrug
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
    depends_on: {flyway: {condition: service_completed_successfully}}
    networks: [internal]
    restart: unless-stopped
  web:
    image: ghcr.io/${GHCR_OWNER}/bddrug-web:${IMAGE_TAG}
    environment: {API_URL: "http://api:8080"}
    depends_on: [api]
    networks: [internal, edge]
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.docker.network=bddrug_edge
      - traefik.http.routers.web.rule=Host(`${PREVIEW_DOMAIN}`)
      - traefik.http.routers.web.entrypoints=websecure
      - traefik.http.routers.web.tls.certresolver=le
      - traefik.http.routers.web.middlewares=ratelimit,secure
      - traefik.http.middlewares.ratelimit.ratelimit.average=10
      - traefik.http.middlewares.ratelimit.ratelimit.burst=30
      - traefik.http.middlewares.ratelimit.ratelimit.period=1s
      - traefik.http.middlewares.secure.headers.stsSeconds=31536000
      - traefik.http.services.web.loadbalancer.server.port=3000
  etl:
    image: ghcr.io/${GHCR_OWNER}/bddrug-etl:${IMAGE_TAG}
    environment: {DATABASE_URL: "postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/bddrug"}
    volumes: [../batches:/app/batches:ro]
    profiles: [jobs]
    networks: [internal, edge]
  traefik:
    image: traefik:v3.2
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.email=${ACME_EMAIL}
      - --certificatesresolvers.le.acme.storage=/letsencrypt/acme.json
      - --certificatesresolvers.le.acme.httpchallenge.entrypoint=web
    ports: ["80:80", "443:443"]
    volumes: ["/var/run/docker.sock:/var/run/docker.sock:ro", "letsencrypt:/letsencrypt"]
    networks: [edge]
    restart: unless-stopped
```
Update the trailing blocks to:
```yaml
volumes: {dbdata: {}, letsencrypt: {}}
networks: {internal: {internal: true}, edge: {}}
```
`internal: true` blocks outbound internet from that network. That's why `etl` is also on `edge`: it needs outbound access to OCL. It has no Traefik labels, so it is never exposed.

- [ ] **Step 2: Validate the compose file**
Run: `cd deploy && docker compose config --quiet && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**
```bash
git add deploy && git commit -m "feat(deploy): traefik TLS, rate limit, internal-only API"
```

---

### Task 8: CI/CD (GitHub Actions → GHCR → VM)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/load-dgda.yml`

**Interfaces:**
- Consumes:
  - repo secrets `VM_HOST`, `VM_USER`, `VM_SSH_KEY`, `PREVIEW_DOMAIN`
  - VM has `/opt/bddrug/deploy` with `docker-compose.yml` and `.env` (DB_PASSWORD etc. live only there)
- Produces: green CI on every PR; auto-deploy on `main`; a manual "Load DGDA" job

- [ ] **Step 1: CI** `.github/workflows/ci.yml`
```yaml
name: ci
on: [pull_request, push]
jobs:
  etl:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.12"}
      - run: pip install -e './etl[test]' && pytest etl/tests -v
  api:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: {distribution: temurin, java-version: "21"}
      - run: cd api && ./gradlew test --no-daemon
  web:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: {node-version: "22"}
      - run: cd web && npm ci && API_URL=http://api:8080 npm test && npm run build
```

- [ ] **Step 2: Deploy** `.github/workflows/deploy.yml`
```yaml
name: deploy
on:
  workflow_run: {workflows: [ci], types: [completed], branches: [main]}
permissions: {contents: read, packages: write}
jobs:
  deploy:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with: {registry: ghcr.io, username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}"}
      - run: |
          for s in etl api web; do
            docker build -t ghcr.io/${{ github.repository_owner }}/bddrug-$s:${{ github.sha }} $s
            docker push ghcr.io/${{ github.repository_owner }}/bddrug-$s:${{ github.sha }}
          done
      - uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VM_HOST }}
          username: ${{ secrets.VM_USER }}
          key: ${{ secrets.VM_SSH_KEY }}
          script: |
            cd /opt/bddrug/deploy
            git -C /opt/bddrug pull --ff-only
            sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${{ github.sha }}/" .env
            docker compose pull && docker compose up -d --remove-orphans
      - run: curl -fsS https://${{ secrets.PREVIEW_DOMAIN }}/ -o /dev/null
```

- [ ] **Step 3: Manual batch run** `.github/workflows/load-dgda.yml`
```yaml
name: load-dgda
on:
  workflow_dispatch:
    inputs: {batch: {description: "Batch file name in batches/, e.g. 0001-pilot.txt", required: true}}
jobs:
  load:
    runs-on: ubuntu-24.04
    steps:
      - uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VM_HOST }}
          username: ${{ secrets.VM_USER }}
          key: ${{ secrets.VM_SSH_KEY }}
          command_timeout: 60m
          script: |
            set -e
            case "${{ inputs.batch }}" in *[!A-Za-z0-9._-]*|"") echo "bad batch name"; exit 1;; esac
            git -C /opt/bddrug pull --ff-only
            cd /opt/bddrug/deploy
            docker compose --profile jobs run --rm etl --batch "/app/batches/${{ inputs.batch }}"
```
The `case` guard rejects anything except a plain file name, so the input cannot inject shell commands.

- [ ] **Step 4: One-time VM bootstrap** (manual, documented in `README.md`)
```bash
# on the VM: Docker + compose plugin installed, DNS A record for PREVIEW_DOMAIN → VM IP, ports 80/443 open
sudo mkdir -p /opt/bddrug && sudo chown $USER /opt/bddrug
git clone git@github.com:<org>/bddrug.git /opt/bddrug
cp /opt/bddrug/deploy/.env.example /opt/bddrug/deploy/.env   # then set real DB_PASSWORD, PREVIEW_DOMAIN, ACME_EMAIL, GHCR_OWNER
echo <ghcr-read-token> | docker login ghcr.io -u <user> --password-stdin
```

- [ ] **Step 5: Push and verify end to end**
1. Create the private GitHub repo and set the four secrets. Push `main`.
2. Wait for `ci` to go green, then `deploy`.
3. Run `load-dgda` with `batch=0001-pilot.txt`.

Expected:
- `https://<PREVIEW_DOMAIN>/batches/0001-pilot` shows 10 items, each with the source panel, the extracted panel and a working "Open original record" link.
- Searching a pilot brand on `/` finds it, and its product page shows its ingredients.
- `curl -s https://<PREVIEW_DOMAIN>/v1/products?q=napa` returns the Next.js 404 page, which proves the API is not public.
- Firing 200 requests in 2 s returns HTTP 429 from Traefik.

- [ ] **Step 6: Commit**
```bash
git add .github README.md && git commit -m "ci(deploy): CI, GHCR images, VM deploy, manual DGDA load"
```

---

## Sprint 1 Definition of Done
- [ ] CI green on `main`; deploy runs automatically.
- [ ] The pilot batch `0001-pilot` is loaded on the VM: 10 requested, 10 loaded, 0 missing (or each missing one explained).
- [ ] **Human verification:** an engineer and a pharmacist compared all 10 records, source panel against extracted panel. The result is recorded in the review sheet (columns: concept ID, reviewer, ok/issue, note). Every issue becomes a failing test plus a fix before Sprint 2 starts.
- [ ] A tester outside the office network can open the batch page and product pages over HTTPS.
- [ ] The API is unreachable from the internet, and the rate limit was observed returning 429.
- [ ] Sprint demo held; tester observations logged as input to the Sprint 2 plan (substance and code stages for the same 10 medicines).

## Self-review notes
- **Spec coverage for Sprint 1:**
  - brand master from DGDA, batch-scoped: Tasks 2–4
  - human-verifiable evidence (raw beside extracted): Task 6A
  - partner-style API envelope: Task 5
  - SSR site, anti-scraping (internal-only API, noindex) and rate limiting: Tasks 6–7
  - Docker and CI/CD: Tasks 7–8
- **Deferred by roadmap:** Keycloak, captcha and flags (S2); substances and crosswalks (S3–S5); DDInter (S6–S7); workbench (S8); checker (S9); releases (S10); partner keys (S11).
- **Review Focus tests are placed:**
  - wildcards and Bengali: Task 5, `wildcardCharactersAreLiteral`, `bengaliQueryReturnsEmptyNotError`
  - query length and page range: Task 5 unit tests
  - no ingredient mapping: Task 5, `detailWithoutMappingHasEmptyIngredients`, plus the page text in Task 6
  - idempotent re-run: Task 4 (`test_rerun_is_idempotent_and_replaces_ingredients`, plus `test_rerun_resets_review_to_pending`)
  - missing concept ID in a batch: Task 4 (`test_missing_concept_is_recorded_as_issue_and_rest_loads`)
  - whitespace: Task 3
