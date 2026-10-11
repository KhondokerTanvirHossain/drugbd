"""Pure parsers for DDInter 2.0 HTML pages (stdlib html.parser only)."""
import re
from dataclasses import dataclass
from html.parser import HTMLParser

_ATC = re.compile(r"^[A-Z]\d{2}[A-Z]{2}\d{2}$")


@dataclass(frozen=True)
class DDInterDrug:
    ddinter_id: str
    name: str
    atc_codes: tuple[str, ...]
    drugbank_id: str | None


@dataclass(frozen=True)
class InteractionText:
    interaction: str | None  # None: DDInter has no text (never a placeholder such as "None")
    management: str | None
    refs: tuple[str, ...]


# What DDInter prints where it has no text. Stored, these read as content ("None" next to an interaction can be
# taken for "no interaction"), so they are treated as missing wherever DDInter free text enters the pipeline.
PLACEHOLDERS = frozenset({"none", "null", "n/a", "na", "-", "--", ""})


def clean_text(value: str | None) -> str | None:
    """DDInter free text, stripped; None when it is missing or a placeholder (case-insensitive, after strip())."""
    if value is None:
        return None
    text = str(value).strip()
    return None if text.lower() in PLACEHOLDERS else text


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


_NOT_A_NAME = {"Basic Information", "ID", "Drug Type", "2D", "3D", "Description", "ATC Classification",
               "Molecular Formula", "Molecular Weight", "CAS Number"}
_DRUGBANK_LINK = re.compile(r"""href\s*=\s*["']?https?://go\.drugbank\.com/drugs/(DB\d{5})(?=[/?#"'\s>])""", re.I)
_SECTION_ENDS = {"Interaction": ("Management", "References", "Alternative for"),
                 "Management": ("References", "Alternative for"),
                 "References": ("Alternative for",)}
_REF_START = re.compile(r"^\[\d+\]\s*")


def parse_drug_detail(html: str, ddinter_id: str) -> DDInterDrug:
    chunks = visible_text(html)
    i = _after(chunks, "Drugs Information:")
    if i is None or i >= len(chunks) or chunks[i] in _NOT_A_NAME:
        raise ValueError("drug name not found")
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
    ids = set(_DRUGBANK_LINK.findall(html))
    return DDInterDrug(ddinter_id, name, tuple(atc), ids.pop() if len(ids) == 1 else None)


def _section(chunks: list[str], label: str, start: int) -> list[str]:
    """Chunks after the first `label` at/after `start`, up to the next known label."""
    i = _after(chunks, label, start)
    if i is None:
        return []
    ends = _SECTION_ENDS[label]
    for k in range(i, len(chunks)):
        if chunks[k] in ends:
            return chunks[i:k]
    return chunks[i:]


def parse_interaction(html: str) -> InteractionText:
    chunks = visible_text(html)
    start = _after(chunks, "Basic Information") or 0
    if _after(chunks, "Interaction", start) is None:
        raise ValueError("no 'Interaction' section")
    interaction = clean_text(" ".join(_section(chunks, "Interaction", start)))
    management = clean_text(" ".join(_section(chunks, "Management", start)))
    refs: list[str] = []
    for c in _section(chunks, "References", start):
        if _REF_START.match(c):
            refs.append(_REF_START.sub("", c))
        elif refs:
            refs[-1] += " " + c
    refs = [re.sub(r"\s+([,.;:)])", r"\1", r).strip() for r in refs]
    return InteractionText(interaction, management, tuple(refs))
