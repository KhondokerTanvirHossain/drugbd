"""RxNav lookups: name -> RxCUI (IN preferred) and RxCUI -> ATC/DrugBank/SNOMED CT codes."""
from dataclasses import dataclass

MIN_APPROX_SCORE = 5.0


@dataclass(frozen=True)
class RxCodes:
    rxcui: str
    name: str
    tty: str
    atc: tuple[str, ...]
    drugbank: tuple[str, ...]
    snomedct: tuple[str, ...]


class RxNavClient:
    BASE = "https://rxnav.nlm.nih.gov/REST"

    def __init__(self, http):
        self.http = http

    def _json(self, path: str, params: dict | None = None) -> dict:
        resp = self.http.get(f"{self.BASE}{path}", params=params)
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()
        return resp.json()

    def _properties(self, rxcui: str) -> dict:
        return self._json(f"/rxcui/{rxcui}/properties.json").get("properties") or {}

    def _final_in(self, rxcui: str) -> str | None:
        """Resolve to an IN rxcui, following a PIN to its base IN. None if unknown or ambiguous."""
        props = self._properties(rxcui)
        tty = props.get("tty")
        if tty == "IN":
            return rxcui
        if tty != "PIN":
            return None
        groups = self._json(f"/rxcui/{rxcui}/related.json", {"tty": "IN"}).get("relatedGroup", {}).get("conceptGroup") or []
        ins: dict[str, str] = {}
        for g in groups:
            for p in g.get("conceptProperties") or []:
                if p.get("tty") == "IN":
                    ins[p["rxcui"]] = p.get("name", "")
        if len(ins) == 1:
            return next(iter(ins))
        words = props.get("name", "").split()
        first = words[0].lower() if words else ""
        hits = [r for r, n in ins.items() if n and first.startswith(n.lower())]
        return hits[0] if len(hits) == 1 else None

    def rxcui_for_name(self, name: str) -> tuple[str, str] | None:
        ids = self._json("/rxcui.json", {"name": name, "search": 2}).get("idGroup", {}).get("rxnormId") or []
        if len(ids) == 1:
            final = self._final_in(ids[0])
            return (final, "rxnav-exact") if final else None
        if ids:
            ins = [i for i in ids if self._properties(i).get("tty") == "IN"]
            return (ins[0], "rxnav-exact") if len(ins) == 1 else None
        cands = self._json("/approximateTerm.json", {"term": name, "maxEntries": 1}).get("approximateGroup", {}).get("candidate") or []
        if not cands:
            return None
        top = max(float(c.get("score", 0)) for c in cands)
        if top < MIN_APPROX_SCORE:
            return None
        rxcuis = {c["rxcui"] for c in cands if float(c.get("score", 0)) == top}
        if len(rxcuis) != 1:
            return None
        final = self._final_in(next(iter(rxcuis)))
        return (final, "rxnav-approx") if final else None

    def codes_for_rxcui(self, rxcui: str) -> RxCodes:
        props = self._properties(rxcui)
        concepts = self._json(f"/rxcui/{rxcui}/allProperties.json", {"prop": "codes"}).get("propConceptGroup", {}).get("propConcept") or []

        def pick(prop: str, ok=lambda v: True) -> tuple[str, ...]:
            out: list[str] = []
            for c in concepts:
                v = c.get("propValue", "")
                if c.get("propName") == prop and ok(v) and v not in out:
                    out.append(v)
            return tuple(out)

        return RxCodes(rxcui, props.get("name", ""), props.get("tty", ""),
                       pick("ATC", lambda v: len(v) == 7), pick("DRUGBANK"), pick("SNOMEDCT"))
