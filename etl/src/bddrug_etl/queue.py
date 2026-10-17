"""The frozen DGDA batch queue: a fixed popularity order for every registered product, and the batch-file guard.

Batches never come from a live DGDA query, because the register changes over time and a recomputed ranking would
skip or repeat products. The queue is ranked once from one register pull and committed. Batch files take ids from
it, and ``check_batches`` (run in CI by tests/test_batch_files.py) fails when an id is in two batch files or is not
in the queue. Gaps are reported, not failed: batches of 10 deliberately pick edge cases across the ranking.

Order:
- Probable veterinary products come last: the third segment of the DAR number is a category code, and 077 holds the
  register's boluses and water-soluble powders (443 of 448 and 18 of 19 on 17/10/2026). They are kept in the queue,
  flagged, never dropped; see VET_CATEGORY. To be confirmed with the pharmacist or DGDA.
- Generics are ranked by how many active Drug brands carry them, most first; ties break on the generic key.
- Within a generic, one brand per distinct (dosage form, registered content) comes first, so the clinical variety
  is covered early. The remaining same-composition brands follow. Each group is sorted by concept id.

CLI:
    python -m bddrug_etl.queue build <register.json> <queue.tsv>
    python -m bddrug_etl.queue check <batches dir> <queue.tsv>
"""
import json
import pathlib
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass

from bddrug_etl.load.batches import read_batch_file

_UNIT = r"(mg|mcg|µg|microgram|gm|g|ml|iu|%|units?|mmol|lac|million)"
_NOISE = r"\b(bp|usp|ip|eq\.?|equivalent|to|as|of|each|contains|per|w/w|w/v|v/v)\b"


def generic_key(content: str) -> str:
    """The generic a product's registered content names, without strengths: "Sulphamethoxazole + Trimethoprim 800 mg
    + 160 mg" and "Trimethoprim + Sulphamethoxazole 400 mg + 80 mg" both give "sulphamethoxazole + trimethoprim"."""
    g = " ".join(str(content or "").split()).lower()
    g = re.sub(r"\([^)]*\)", " ", g)
    g = re.sub(r"/[^+]*", " ", g)  # per-unit wording: "100 mcg/Metered Inhalation", "/5 ml", "/Spray"
    g = re.sub(r"\b\d+(\.\d+)?\s*" + _UNIT + r"\b", " ", g)
    g = re.sub(r"[\d.,/]+", " ", g)
    g = re.sub(_NOISE, " ", g)
    g = re.sub(r"\s*\+\s*|\s+and\s+", "+", g)
    parts = sorted({" ".join(p.split()) for p in g.split("+")} - {""})
    return " + ".join(p for p in parts if len(p) > 2)


VET_CATEGORY = "077"


def dar_category(concept_id: str) -> str:
    """The third segment of the DAR number in a DGDA concept id: "005-1114-077--acivet-cipro" gives "077"."""
    parts = concept_id.split("--", 1)[0].split("-")
    return parts[2] if len(parts) > 2 else ""


def probably_veterinary(concept_id: str) -> bool:
    return dar_category(concept_id) == VET_CATEGORY


@dataclass(frozen=True)
class Entry:
    position: int
    concept_id: str
    generic: str
    generic_rank: int
    generic_brands: int
    trade_name: str
    dosage_form: str
    content: str
    veterinary: bool


def build_queue(concepts: list[dict]) -> list[Entry]:
    """Every active Drug concept exactly once, in the frozen order (see the module docstring)."""
    drugs = [c for c in concepts if c.get("cls") == "Drug" and not c.get("retired")]
    seen: set[str] = set()
    by_generic: dict[tuple[bool, str], list[dict]] = defaultdict(list)
    for c in sorted(drugs, key=lambda c: c["id"]):
        if c["id"] in seen:
            continue
        seen.add(c["id"])
        by_generic[(probably_veterinary(c["id"]), generic_key(c.get("generic", "")))].append(c)
    counts = Counter({g: len(cs) for g, cs in by_generic.items()})
    ranked = sorted(counts, key=lambda g: (g[0], -counts[g], g[1]))
    out: list[Entry] = []
    for rank, g in enumerate(ranked, start=1):
        firsts, rest, shapes = [], [], set()
        for c in by_generic[g]:
            shape = ((c.get("form") or "").strip().lower(), " ".join(str(c.get("generic") or "").split()).lower())
            (rest if shape in shapes else firsts).append(c)
            shapes.add(shape)
        for c in firsts + rest:
            out.append(Entry(len(out) + 1, c["id"], g[1], rank, counts[g], " ".join(str(c.get("trade") or "").split()),
                             " ".join(str(c.get("form") or "").split()), " ".join(str(c.get("generic") or "").split()), g[0]))
    return out


HEADER = ["position", "concept_id", "generic", "generic_rank", "generic_brands", "trade_name", "dosage_form", "content",
          "veterinary"]


def write_tsv(entries: list[Entry], path: pathlib.Path, source_note: str) -> None:
    clean = lambda v: ("yes" if v else "no") if isinstance(v, bool) else str(v).replace("\t", " ").replace("\n", " ")
    lines = [f"# {source_note}", "\t".join(HEADER)]
    lines += ["\t".join(clean(getattr(e, h)) for h in HEADER) for e in entries]
    path.write_text("\n".join(lines) + "\n")


def read_queue_ids(path: pathlib.Path) -> dict[str, int]:
    """concept_id -> position, from a queue TSV."""
    ids: dict[str, int] = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith("#") or line.startswith("position\t"):
            continue
        pos, cid = line.split("\t", 2)[:2]
        ids[cid] = int(pos)
    return ids


@dataclass(frozen=True)
class Report:
    duplicates: dict[str, list[str]]   # concept id -> the batch files that list it (two or more)
    unknown: dict[str, list[str]]      # batch file -> ids not in the queue
    covered: int
    total: int
    first_gap: int | None              # the lowest queue position no batch takes yet

    @property
    def ok(self) -> bool:
        return not self.duplicates and not self.unknown


def check_batches(batch_dir: pathlib.Path, queue: dict[str, int]) -> Report:
    owners: dict[str, list[str]] = defaultdict(list)
    unknown: dict[str, list[str]] = {}
    for f in sorted(batch_dir.glob("[0-9][0-9][0-9][0-9]-*.txt")):
        ids = read_batch_file(f)
        for cid in ids:
            owners[cid].append(f.name)
        bad = [cid for cid in ids if cid not in queue]
        if bad:
            unknown[f.name] = bad
    dups = {cid: fs for cid, fs in owners.items() if len(fs) > 1}
    taken = {queue[c] for c in owners if c in queue}
    gap = next((p for p in range(1, len(queue) + 1) if p not in taken), None)
    return Report(dups, unknown, len(taken), len(queue), gap)


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[0] == "build":
        concepts = json.loads(pathlib.Path(argv[1]).read_text())
        entries = build_queue(concepts)
        write_tsv(entries, pathlib.Path(argv[2]),
                  f"Frozen DGDA batch queue from {pathlib.Path(argv[1]).name}: {len(entries)} active Drug concepts, "
                  "ranked by generic brand count (bddrug_etl.queue). Never regenerate in place; diff a new pull against it.")
        print(f"queue: {len(entries)} entries, {len({e.generic for e in entries})} generics -> {argv[2]}")
        return 0
    if len(argv) == 3 and argv[0] == "check":
        r = check_batches(pathlib.Path(argv[1]), read_queue_ids(pathlib.Path(argv[2])))
        for cid, fs in r.duplicates.items():
            print(f"DUPLICATE {cid}: {', '.join(fs)}")
        for f, ids in r.unknown.items():
            print(f"NOT IN QUEUE {f}: {', '.join(ids)}")
        print(f"coverage: {r.covered} of {r.total} queue positions in a batch; first gap at {r.first_gap}")
        return 0 if r.ok else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
