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

    def _prefer_in(self, rxcui: str) -> str:
        """A PIN (precise ingredient, e.g. a salt) maps to its base IN when one exists."""
        if self._properties(rxcui).get("tty") != "PIN":
            return rxcui
        groups = self._json(f"/rxcui/{rxcui}/related.json", {"tty": "IN"}).get("relatedGroup", {}).get("conceptGroup") or []
        for g in groups:
            for p in g.get("conceptProperties") or []:
                if p.get("tty") == "IN":
                    return p["rxcui"]
        return rxcui

    def rxcui_for_name(self, name: str) -> tuple[str, str] | None:
        ids = self._json("/rxcui.json", {"name": name, "search": 2}).get("idGroup", {}).get("rxnormId") or []
        if ids:
            return self._prefer_in(ids[0]), "rxnav-exact"
        cands = self._json("/approximateTerm.json", {"term": name, "maxEntries": 1}).get("approximateGroup", {}).get("candidate") or []
        if cands and float(cands[0].get("score", 0)) >= MIN_APPROX_SCORE:
            return self._prefer_in(cands[0]["rxcui"]), "rxnav-approx"
        return None

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
