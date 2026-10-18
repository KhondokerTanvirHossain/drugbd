# IntelliDrugs QA MCP server

A small, read-only [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, for the product owner's QA project: another LLM uses it to re-check IntelliDrugs data against its sources and report mismatches. It wraps the read-only QA API (`/api/qa/v1/*`, spec §7.9) and nothing else. It has **no write tool**.

It sits outside `web/`: the web build, the bundle-secret scan and the island check never see it. CI runs it as its own `qa-mcp` job.

## Setup

Node 20 or newer.

```sh
cd tools/qa-mcp
npm ci && npm run build && node dist/index.js
```

`node dist/index.js` speaks MCP on stdin/stdout; an MCP client starts it for you (below). `npm test` type-checks and runs the unit tests (vitest, mocked `fetch`).

### Environment

| Variable | Required | Meaning |
|---|---|---|
| `INTELLIDRUGS_QA_KEY` | yes | Your QA key. Missing: the server writes `INTELLIDRUGS_QA_KEY is not set` to stderr and exits 1. A value that cannot be a QA key (32–256 characters of `A–Z a–z 0–9 . _ ~ + / = -`) also exits 1. |
| `INTELLIDRUGS_QA_BASE_URL` | no | Default `https://drugdb.eliooo.org`. Must be an `https:` origin, or `http://localhost` / `http://127.0.0.1` (any port) for local testing, with no credentials, path, query or fragment. Anything else exits 1. |

The key is sent only as `Authorization: Bearer …`, only to that origin, with redirects refused and a 30-second timeout. stdout carries the protocol only, and nothing the server writes (results, errors, stderr) ever contains the key.

### Getting a key

Ask the product owner. A key is generated and handed over once, by the runbook [`docs/runbooks/qa-api-keys.md`](../../docs/runbooks/qa-api-keys.md); only its SHA-256 hash is stored on the server. **Never commit the key, and never put it in a config file under version control** (for example a project `.mcp.json`). Keep it in a password manager and in your user-level MCP client config only. If it leaks, tell the product owner, who revokes it.

## Client configuration

### Claude Desktop

In `claude_desktop_config.json` (your user config directory, not a repository):

```json
{
  "mcpServers": {
    "intellidrugs-qa": {
      "command": "node",
      "args": ["/absolute/path/to/ddinter2/tools/qa-mcp/dist/index.js"],
      "env": { "INTELLIDRUGS_QA_KEY": "<your QA key>" }
    }
  }
}
```

### Claude Code

Read the key without echoing it or keeping it in shell history, then add the server at local (user-private) scope, never `--scope project`, which writes `.mcp.json` into the repository:

```sh
read -rs INTELLIDRUGS_QA_KEY
claude mcp add intellidrugs-qa --scope local --env INTELLIDRUGS_QA_KEY="$INTELLIDRUGS_QA_KEY" \
  -- node /absolute/path/to/ddinter2/tools/qa-mcp/dist/index.js
unset INTELLIDRUGS_QA_KEY
```

For a local web app, add `--env INTELLIDRUGS_QA_BASE_URL=http://localhost:3000`.

## Tools

All five are read-only (`readOnlyHint: true`) and map 1:1 to the QA API. Inputs are checked against the API's own rules (§7.9.2) before any request; a bad input is refused with `Invalid input {name}` and no call is made.

| Tool | Input | Calls |
|---|---|---|
| `list_batches` | `{}` | `GET /api/qa/v1/batches` |
| `get_batch` | `{ batchId }` | `GET /api/qa/v1/batches/{batchId}` |
| `get_record` | `{ batchId, conceptId }` | `GET /api/qa/v1/batches/{batchId}/records/{conceptId}` |
| `find_records` | `{ filter, stage?, batch?, page? }` | `GET /api/qa/v1/records?…` |
| `get_pairs` | `{ bdsId, page? }` | `GET /api/qa/v1/substances/{bdsId}/pairs?page=` |

- `batchId`, `batch`: `^[A-Za-z0-9._-]{1,100}$` (not `.` or `..`, which no HTTP client can send as a path segment).
- `conceptId`: 1–200 characters, no control character (not `.` or `..`), exactly as `get_batch` or `find_records` returns it. Ids are percent-encoded into their path segment.
- `bdsId`: `^BDS-[0-9]{6}$`.
- `filter`: `strength_missing`, `parse_partial`, `route_assumed`, `no_ddinter_data`, `unaligned`, `stage_warn`, `stage_fail` (§7.9.4).
- `stage`: `dgda`, `substances`, `clinical` or `ddinter`; only with `filter: "stage_warn"`.
- `page`: integer 0–999 (100 records or 50 pairs a page; the body carries `total` and `size`).

### Results

Every result, errors included, is two text items: first the fixed preamble below, then either the QA API's response body as indented JSON (the platform envelope `{ success, data, message, errors, metadata }`, unchanged) or one error line:

| Error line | When |
|---|---|
| `QA API error {status} {code}` | The API answered an error envelope, for example `QA API error 401 UNAUTHORIZED`, `QA API error 400 INVALID_QUERY`, `QA API error 404 NOT_FOUND`, `QA API error 429 RATE_LIMITED`, `QA API error 502 UNAVAILABLE`. |
| `QA API error {status}` | An error whose body is not the envelope (the per-IP plain-text 429). |
| `QA API error {status} invalid response` | A success status whose body is not the envelope. |
| `QA API unreachable` | A network failure, a refused redirect or the 30-second timeout. |
| `Invalid input {name}` | An input the tool does not take, or one that breaks its rule; no request was made. |

The envelope's `metadata.requestId` names the exact read in the server's audit log, so a finding can cite it. The API allows 60 requests a minute per key.

## The rules (the preamble)

The server prepends this to every result, verbatim:

```
IntelliDrugs QA data. This is UNREVIEWED data for quality assurance only; a pharmacist may not have approved it.
Every finding must cite the exact field path and the source link it was checked against.
"No interaction data" never means a combination is safe.
Report findings; never claim that something was fixed.
Nothing here is clinical advice.
```

- **Unreviewed.** Records are returned whether or not a pharmacist approved them; `displayStatus` and `review` say where each stands.
- **Cite.** A finding names the JSON field path (for example `data.extraction.ingredients[0].strengthValue`, or `.evidence.parsed` of the `data.stages` entry whose `stage` is `clinical`) and the `link` (`{ url, label, fetchedAt }`) it was checked against: the DGDA register, RxNav, WHO ATC/DDD, DrugBank, SNOMED CT through RxNav, ICD-11 search, or the DDInter entry or pair page.
- **No data is not safety.** A substance with DDInter coverage `none`, or a pair with missing text, is a gap to report, never a sign that a combination is safe.
- **Findings only.** This server cannot change anything; a QA run reports what it found and never claims a fix.
- **Not clinical advice.**

The QA API never returns emails, reviewer notes, session data or tokens.
