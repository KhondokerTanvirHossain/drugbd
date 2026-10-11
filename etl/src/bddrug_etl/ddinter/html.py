"""Pure parsers for DDInter 2.0 HTML pages (stdlib html.parser only)."""
import re
from dataclasses import dataclass
from html.parser import HTMLParser

_ATC = re.compile(r"^[A-Z]\d{2}[A-Z]{2}\d{2}$")
_DRUGBANK = re.compile(r"go\.drugbank\.com/drugs/(DB\d+)")
_REF_PREFIX = re.compile(r"^\[\d+\]\s*")


@dataclass(frozen=True)
class DDInterDrug:
    ddinter_id: str
    name: str
    atc_codes: tuple[str, ...]
    drugbank_id: str | None


@dataclass(frozen=True)
class InteractionText:
    interaction: str
    management: str
    refs: tuple[str, ...]


class _TextCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.chunks: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if not self._skip:
            text = " ".join(data.split())
            if text:
                self.chunks.append(text)


def visible_text(html: str) -> list[str]:
    p = _TextCollector()
    p.feed(html)
    p.close()
    return p.chunks


def _after(chunks: list[str], heading: str, start: int = 0) -> int | None:
    for i in range(start, len(chunks)):
        if chunks[i] == heading:
            return i + 1
    return None


def parse_drug_detail(html: str, ddinter_id: str) -> DDInterDrug:
    chunks = visible_text(html)
    i = _after(chunks, "Drugs Information:")
    if i is None or i >= len(chunks):
        raise ValueError(f"no 'Drugs Information' title for {ddinter_id}")
    name = chunks[i]
    atc: list[str] = []
    j = _after(chunks, "ATC Classification", i)
    if j is not None:
        while j < len(chunks):
            tokens = [t for t in re.split(r"[,\s]+", chunks[j]) if t]
            if not tokens or not all(_ATC.match(t) for t in tokens):
                break
            atc.extend(t for t in tokens if t not in atc)
            j += 1
    m = _DRUGBANK.search(html)
    return DDInterDrug(ddinter_id, name, tuple(atc), m.group(1) if m else None)


def parse_interaction(html: str) -> InteractionText:
    chunks = visible_text(html)
    start = _after(chunks, "Interaction", _after(chunks, "Basic Information") or 0)
    if start is None:
        raise ValueError("no 'Interaction' section")
    m = _after(chunks, "Management", start)
    r = _after(chunks, "References", m or start)
    interaction = " ".join(chunks[start:(m - 1) if m else len(chunks)])
    management = ""
    if m:
        management = " ".join(chunks[m:(r - 1) if r else len(chunks)])
    refs: list[str] = []
    if r:
        for c in chunks[r:]:
            if c == "Alternative for":
                break
            refs.append(_REF_PREFIX.sub("", c))
    return InteractionText(interaction, management, tuple(refs))
