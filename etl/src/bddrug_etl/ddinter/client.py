"""DDInter 2.0 client. Every request goes through SnapshotHttp (paced, stored in raw.http_snapshot)."""
import re
from dataclasses import dataclass

from bddrug_etl.ddinter.html import DDInterDrug, InteractionText, parse_drug_detail, parse_interaction

PAGE = 500
_TOKEN_IN_PAGE = re.compile(r"csrfmiddlewaretoken\s*:\s*['\"]([^'\"]+)['\"]")
_INT_LEVEL = {3: "major", 2: "moderate", 1: "minor"}


@dataclass(frozen=True)
class DDInterPairRow:
    partner_id: str
    partner_name: str
    severity: str
    actions: tuple[str, ...]


def severity(level) -> str:
    """Map a DDInter level (int 3/2/1 or string '3'/'2'/'1') to major/moderate/minor, else 'unknown'."""
    try:
        return _INT_LEVEL.get(int(level), "unknown")
    except (TypeError, ValueError):
        return "unknown"


def _refs(value) -> list[str]:
    return [r.strip() for r in (value or "").split("|") if r.strip()]


class DDInterClient:
    BASE = "https://ddinter2.scbdd.com"

    def __init__(self, http):
        self.http = http
        self._token: str | None = None

    def _csrf(self) -> str:
        if self._token is None:
            resp = self.http.get(f"{self.BASE}/server/drug/")
            resp.raise_for_status()
            m = _TOKEN_IN_PAGE.search(resp.text)
            token = m.group(1) if m else self.http.http.cookies.get("csrftoken")
            if not token:
                raise RuntimeError("DDInter CSRF token not found in page or cookie")
            self._token = token
        return self._token

    def _post_page(self, path: str, referer: str, start: int, extra: dict | None = None) -> dict:
        token = self._csrf()
        data = {"draw": "1", "start": str(start), "length": str(PAGE), "search[value]": "",
                **(extra or {}), "csrfmiddlewaretoken": token}
        resp = self.http.post(
            f"{self.BASE}{path}", data,
            headers={"X-CSRFToken": token, "X-Requested-With": "XMLHttpRequest",
                     "Origin": self.BASE, "Referer": f"{self.BASE}{referer}"},
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("status") == "error" or "data" not in body:
            raise RuntimeError(f"DDInter POST {path} failed: {body.get('msg', 'no data')}")
        return body

    def _pages(self, path: str, referer: str, extra: dict | None = None):
        """Yield pages of rows until recordsTotal is reached."""
        start = 0
        while True:
            body = self._post_page(path, referer, start, extra)
            rows = body["data"]
            if not rows:
                return
            yield rows
            start += PAGE
            if start >= int(body.get("recordsTotal", 0)):
                return

    def _get(self, path: str):
        resp = self.http.get(f"{self.BASE}{path}")
        resp.raise_for_status()
        return resp

    def drug_list(self) -> list[tuple[str, str]]:
        out = []
        for rows in self._pages("/server/drug-source/", "/server/drug/"):
            out.extend((r["internalID"], r["name"]) for r in rows)
        return out

    def drug_detail(self, ddinter_id: str) -> DDInterDrug:
        return parse_drug_detail(self._get(f"/server/drug-detail/{ddinter_id}/").text, ddinter_id)

    def graph(self, ddinter_id: str) -> list[DDInterPairRow]:
        body = self._get(f"/server/grapher-datasource/{ddinter_id}/").json()
        out = []
        for it in body.get("interactions", []):
            levels = it.get("level") or []
            sev = str(levels[0]).lower() if levels else "unknown"
            out.append(DDInterPairRow(it["id"], it["name"], sev,
                                      tuple(str(a).lower() for a in it.get("actions") or [])))
        return out

    def pair_interaction_id(self, ddinter_id: str, partner_id: str) -> str | None:
        """The server ignores search[value] (verified 2026-10-11), so page through and match on drug_id."""
        for rows in self._pages(f"/server/interact-with/{ddinter_id}/", f"/server/drug-detail/{ddinter_id}/",
                                {"severity": "", "mechanism": ""}):
            for r in rows:
                if r.get("drug_id") == partner_id:
                    return str(r["interaction_id"])
        return None

    def diseases(self, ddinter_id: str) -> list[dict]:
        out = []
        for rows in self._pages(f"/server/interact-with-dis/{ddinter_id}/", f"/server/drug-detail/{ddinter_id}/"):
            for r in rows:
                out.append({"interaction_id": str(r["interaction_id"]), "severity": severity(r.get("level")),
                            "disease_name": r.get("diseaseName"), "references": _refs(r.get("references")),
                            "text": r.get("text")})
        return out

    def foods(self, ddinter_id: str) -> list[dict]:
        out = []
        for rows in self._pages(f"/server/interact-with-food/{ddinter_id}/", f"/server/drug-detail/{ddinter_id}/"):
            for r in rows:
                mech = (r.get("magnesium") or "").strip().lower()
                out.append({"interaction_id": str(r["interaction_id"]), "severity": severity(r.get("level")),
                            "food_name": r.get("foodName"), "references": _refs(r.get("references")),
                            "mechanism": mech or None, "management": r.get("newManagement"),
                            "interaction": r.get("newInteraction")})
        return out

    def interaction(self, interaction_id: str) -> InteractionText:
        return parse_interaction(self._get(f"/server/interact/{interaction_id}/").text)
