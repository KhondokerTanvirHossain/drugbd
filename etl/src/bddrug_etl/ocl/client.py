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
