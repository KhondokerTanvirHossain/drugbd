import pathlib
import httpx, psycopg, pytest, respx
from testcontainers.postgres import PostgresContainer
from bddrug_etl.http.snapshot import SnapshotHttp

ROOT = pathlib.Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c


class FakeTime:
    def __init__(self):
        self.now = 100.0
        self.sleeps = []

    def clock(self):
        return self.now

    def sleep(self, s):
        self.sleeps.append(s)
        self.now += s


def make(conn, source="rxnav", interval=0.0, ft=None):
    ft = ft or FakeTime()
    return SnapshotHttp(conn, source, httpx.Client(), interval, clock=ft.clock, sleep=ft.sleep), ft


def rows(conn, source):
    return conn.execute(
        "SELECT request_key, status, body FROM raw.http_snapshot WHERE source=%s ORDER BY request_key", (source,)
    ).fetchall()


@respx.mock
def test_get_writes_snapshot_and_upserts_on_repeat(conn):
    route = respx.get("https://x.test/REST/a.json").mock(return_value=httpx.Response(200, text="one"))
    s, _ = make(conn, "src-get")
    r = s.get("https://x.test/REST/a.json", params={"name": "Para cetamol", "search": 2})
    assert r.text == "one"
    key = "GET /REST/a.json?name=Para%20cetamol&search=2"
    assert rows(conn, "src-get") == [(key, 200, "one")]
    route.mock(return_value=httpx.Response(404, text="two"))
    s.get("https://x.test/REST/a.json", params={"name": "Para cetamol", "search": 2})
    assert rows(conn, "src-get") == [(key, 404, "two")]


@respx.mock
def test_pacing_sleeps_between_calls(conn):
    respx.get("https://x.test/p").mock(return_value=httpx.Response(200, text="ok"))
    s, ft = make(conn, "src-pace", interval=0.2)
    s.get("https://x.test/p")
    assert ft.sleeps == []
    ft.now += 0.05
    s.get("https://x.test/p")
    assert len(ft.sleeps) == 1 and ft.sleeps[0] == pytest.approx(0.15)
    ft.now += 1.0  # long gap: no sleep needed
    s.get("https://x.test/p")
    assert len(ft.sleeps) == 1


@respx.mock
def test_post_request_key_excludes_csrf_token(conn):
    route = respx.post("https://x.test/search/").mock(return_value=httpx.Response(200, text="found"))
    s, _ = make(conn, "src-post")
    r = s.post("https://x.test/search/", {"csrfmiddlewaretoken": "SECRET", "q": "b", "a": "1"}, headers={"Referer": "https://x.test/"})
    assert r.text == "found"
    assert b"csrfmiddlewaretoken=SECRET" in route.calls[0].request.content
    assert route.calls[0].request.headers["referer"] == "https://x.test/"
    assert rows(conn, "src-post") == [("POST /search/#a=1&q=b", 200, "found")]


def test_default_user_agent_is_set(conn):
    s, _ = make(conn, "src-ua")
    assert s.http.headers["user-agent"] == "bddrug-etl/0.2 (+niramoy)"
