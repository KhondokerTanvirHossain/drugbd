"""Paced HTTP client that stores every response in raw.http_snapshot.

The caller owns the transaction: snapshot rows are written on the given
connection and committed (or rolled back) with it.
"""
import re
import time
from urllib.parse import urlencode
from collections.abc import Callable

import httpx

USER_AGENT = "bddrug-etl/0.2 (+niramoy)"
CSRF_FIELD = "csrfmiddlewaretoken"

_CSRF_INPUT = re.compile(r"<input\b[^>]*\bname\s*=\s*[\"']?csrfmiddlewaretoken[\"']?[^>]*>", re.I)
_VALUE_ATTR = re.compile(r"(\bvalue\s*=\s*)(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
_CSRF_JSON = re.compile(r'("csrfmiddlewaretoken"\s*:\s*)"[^"]*"')
_CSRF_JS = re.compile(r"""(\bcsrfmiddlewaretoken\s*:\s*)(['"])[^'"]*\2""")


def redact(body: str) -> str:
    body = _CSRF_INPUT.sub(lambda m: _VALUE_ATTR.sub(lambda v: f'{v.group(1)}"[redacted]"', m.group(0)), body)
    body = _CSRF_JSON.sub(r'\1"[redacted]"', body)
    return _CSRF_JS.sub(r"\1'[redacted]'", body)


class SnapshotHttp:
    def __init__(self, conn, source: str, http: httpx.Client, min_interval_s: float,
                 user_agent: str = USER_AGENT, *,
                 clock: Callable[[], float] = time.monotonic,
                 sleep: Callable[[float], None] = time.sleep):
        self.conn = conn
        self.source = source
        self.http = http
        self.min_interval_s = min_interval_s
        self._clock = clock
        self._sleep = sleep
        self._last: float | None = None
        self._headers = {"User-Agent": user_agent}

    def _pace(self) -> None:
        if self._last is not None:
            wait = self.min_interval_s - (self._clock() - self._last)
            if wait > 0:
                self._sleep(wait)
        self._last = self._clock()

    def _store(self, key: str, resp: httpx.Response) -> None:
        self.conn.execute(
            """INSERT INTO raw.http_snapshot (source, request_key, status, body)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (source, request_key)
               DO UPDATE SET status = EXCLUDED.status, body = EXCLUDED.body, fetched_at = now()
               WHERE NOT (raw.http_snapshot.status BETWEEN 200 AND 299) OR EXCLUDED.status BETWEEN 200 AND 299""",
            (self.source, key, resp.status_code, redact(resp.text)),
        )

    def get(self, url: str, params: dict | None = None) -> httpx.Response:
        self._pace()
        resp = self.http.get(url, params=params, headers=self._headers)
        self._store("GET " + resp.request.url.raw_path.decode(), resp)
        return resp

    def post(self, url: str, data: dict, headers: dict | None = None) -> httpx.Response:
        self._pace()
        resp = self.http.post(url, data=data, headers={**self._headers, **(headers or {})})
        fields = urlencode(sorted((k, v) for k, v in data.items() if k != CSRF_FIELD))
        query = resp.request.url.query.decode()
        path = resp.request.url.path + (f"?{query}" if query else "")
        self._store(f"POST {path}#{fields}", resp)
        return resp
