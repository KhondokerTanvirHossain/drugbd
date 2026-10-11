"""Paced HTTP client that stores every response in raw.http_snapshot.

The caller owns the transaction: snapshot rows are written on the given
connection and committed (or rolled back) with it.
"""
import time
from collections.abc import Callable

import httpx

USER_AGENT = "bddrug-etl/0.2 (+niramoy)"
CSRF_FIELD = "csrfmiddlewaretoken"


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
        self.http.headers["User-Agent"] = user_agent

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
               DO UPDATE SET status = EXCLUDED.status, body = EXCLUDED.body, fetched_at = now()""",
            (self.source, key, resp.status_code, resp.text),
        )

    def get(self, url: str, params: dict | None = None) -> httpx.Response:
        self._pace()
        resp = self.http.get(url, params=params)
        self._store("GET " + resp.request.url.raw_path.decode(), resp)
        return resp

    def post(self, url: str, data: dict, headers: dict | None = None) -> httpx.Response:
        self._pace()
        resp = self.http.post(url, data=data, headers=headers)
        fields = "&".join(f"{k}={v}" for k, v in sorted(data.items()) if k != CSRF_FIELD)
        self._store(f"POST {resp.request.url.path}#{fields}", resp)
        return resp
