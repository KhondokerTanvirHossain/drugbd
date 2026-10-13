"""DDInter 2.0 client. Every request goes through SnapshotHttp (paced, stored in raw.http_snapshot)."""
import re
from dataclasses import dataclass

import httpx

from bddrug_etl.ddinter.html import DDInterDrug, InteractionText, clean_text, parse_drug_detail, parse_interaction

PAGE = 500
_TOKEN_IN_PAGE = re.compile(r"csrfmiddlewaretoken\s*:\s*['\"]([^'\"]+)['\"]")
_INT_LEVEL = {3: "major", 2: "moderate", 1: "minor"}


@dataclass(frozen=True)
class DDInterPairRow:
    partner_id: str
    partner_name: str
    severity: str
    actions: tuple[str, ...]


@dataclass(frozen=True)
class InteractWithRow:
    """One row of a drug's interact-with list: the partner, the interaction id and the mapped severity."""
    partner_id: str
    partner_name: str
    interaction_id: str
    severity: str


@dataclass(frozen=True)
class InteractWithList:
    """A drug's interact-with list. ``complete`` is False when a page failed, when fewer or more rows were read than
    ``recordsTotal``, or when a row came back twice (paging overlap). An incomplete list must never be used to say
    "no interaction listed" (spec §6.7.2, §8.1 item 5)."""
    rows: tuple[InteractWithRow, ...]
    complete: bool


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
        assert http.min_interval_s >= 1.0, "DDInter requires min_interval_s >= 1.0"
        self.http = http
        self._token: str | None = None
        self._interact_rows: dict[str, tuple[list[dict], int]] = {}
        self._interact_maps: dict[str, dict[str, str]] = {}

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
            try:
                total = int(body["recordsTotal"])
            except (KeyError, TypeError, ValueError):
                raise ValueError(f"DDInter POST {path}: missing or non-integer recordsTotal") from None
            if start >= total:
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

    def _read_interact_with(self, ddinter_id: str) -> tuple[list[dict], int]:
        """Every row of the drug's interact-with list and the server's recordsTotal, read once per drug (memoised).

        The server ignores search[value] (verified 2026-10-11), so the whole list is read. Raises on a failed page.
        """
        if ddinter_id not in self._interact_rows:
            path, referer = f"/server/interact-with/{ddinter_id}/", f"/server/drug-detail/{ddinter_id}/"
            rows: list[dict] = []
            start = 0
            while True:
                body = self._post_page(path, referer, start, {"severity": "", "mechanism": ""})
                try:
                    total = int(body["recordsTotal"])
                except (KeyError, TypeError, ValueError):
                    raise ValueError(f"DDInter POST {path}: missing or non-integer recordsTotal") from None
                page = body["data"]
                if not page:
                    break
                rows.extend(page)
                start += PAGE
                if start >= total:
                    break
            self._interact_rows[ddinter_id] = (rows, total)
        return self._interact_rows[ddinter_id]

    def interact_with(self, ddinter_id: str) -> InteractWithList:
        """The drug's full interact-with list, with ``complete`` saying whether it can be trusted as the whole list."""
        try:
            raw, total = self._read_interact_with(ddinter_id)
            rows = tuple(InteractWithRow(str(r["drug_id"]), str(r.get("drug_name") or r["drug_id"]),
                                         str(r["interaction_id"]), severity(r.get("level"))) for r in raw)
        except (httpx.HTTPError, RuntimeError, ValueError, KeyError, TypeError, AttributeError):
            # AttributeError: a page that is valid JSON but not an object (``_post_page`` calls ``body.get``)
            return InteractWithList((), False)
        distinct = {(row.partner_id, row.interaction_id) for row in rows}
        return InteractWithList(rows, len(rows) == total and len(distinct) == total)

    def interact_with_map(self, ddinter_id: str) -> dict[str, str]:
        """partner drug id -> interaction id, from the same memoised read as ``interact_with``. Raises on a failed page."""
        if ddinter_id not in self._interact_maps:
            m: dict[str, str] = {}
            for r in self._read_interact_with(ddinter_id)[0]:
                m.setdefault(r["drug_id"], str(r["interaction_id"]))
            self._interact_maps[ddinter_id] = m
        return self._interact_maps[ddinter_id]

    def pair_interaction_id(self, ddinter_id: str, partner_id: str) -> str | None:
        return self.interact_with_map(ddinter_id).get(partner_id)

    def diseases(self, ddinter_id: str) -> list[dict]:
        out = []
        for rows in self._pages(f"/server/interact-with-dis/{ddinter_id}/", f"/server/drug-detail/{ddinter_id}/"):
            for r in rows:
                out.append({"interaction_id": str(r["interaction_id"]), "severity": severity(r.get("level")),
                            "disease_name": r.get("diseaseName"), "references": _refs(r.get("references")),
                            "text": clean_text(r.get("text"))})
        return out

    def foods(self, ddinter_id: str) -> list[dict]:
        out = []
        for rows in self._pages(f"/server/interact-with-food/{ddinter_id}/", f"/server/drug-detail/{ddinter_id}/"):
            for r in rows:
                mech = (r.get("magnesium") or "").strip().lower()
                out.append({"interaction_id": str(r["interaction_id"]), "severity": severity(r.get("level")),
                            "food_name": r.get("foodName"), "references": _refs(r.get("references")),
                            "mechanism": mech or None, "management": clean_text(r.get("newManagement")),
                            "interaction": clean_text(r.get("newInteraction"))})
        return out

    def interaction(self, interaction_id: str) -> InteractionText:
        return parse_interaction(self._get(f"/server/interact/{interaction_id}/").text)
