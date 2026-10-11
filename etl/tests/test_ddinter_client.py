import json
import pathlib

import httpx
import psycopg
import pytest
import respx
from testcontainers.postgres import PostgresContainer

import bddrug_etl.ddinter.client as mod
from bddrug_etl.ddinter.client import DDInterClient, DDInterPairRow, severity
from bddrug_etl.http.snapshot import SnapshotHttp

ROOT = pathlib.Path(__file__).resolve().parents[2]
FX = pathlib.Path(__file__).parent / "fixtures" / "ddinter"
B = "https://ddinter2.scbdd.com"
TOKEN = "TESTTOKEN123"
LIST_PAGE = f"<script>$.ajaxSetup({{data: {{csrfmiddlewaretoken: '{TOKEN}',}}}});</script>"


def fx(name):
    return (FX / name).read_text()


def fxj(name):
    return json.loads(fx(name))


@pytest.fixture(scope="module")
def conn():
    with PostgresContainer("postgres:16", driver=None) as pg:
        with psycopg.connect(pg.get_connection_url()) as c:
            for f in sorted((ROOT / "db/migrations").glob("V*.sql")):
                c.execute(f.read_text())
            c.commit()
            yield c


@pytest.fixture
def client(conn):
    conn.execute("DELETE FROM raw.http_snapshot WHERE source='ddinter'")
    http = SnapshotHttp(conn, "ddinter", httpx.Client(), 1.0, sleep=lambda s: None)
    return DDInterClient(http)


def snap_keys(conn):
    return [r[0] for r in conn.execute(
        "SELECT request_key FROM raw.http_snapshot WHERE source='ddinter' ORDER BY request_key")]


def mock_session():
    return respx.get(f"{B}/server/drug/").mock(return_value=httpx.Response(200, text=LIST_PAGE))


def test_severity_map():
    assert [severity(x) for x in (3, 2, 1, 0, 7, None, "3", "2", "1", "x")] == \
        ["major", "moderate", "minor", "unknown", "unknown", "unknown", "major", "moderate", "minor", "unknown"]


@respx.mock
def test_drug_list_pages_until_records_total_and_sends_csrf(client, conn, monkeypatch):
    mock_session()
    rows = fxj("drug_list_p1.json")["data"]
    seen = []

    def handler(request):
        form = dict(httpx.QueryParams(request.content.decode()))
        seen.append((request, form))
        start = int(form["start"])
        page = rows[:5] if start == 0 else rows[:2]
        return httpx.Response(200, json={"recordsTotal": 7, "data": page})

    monkeypatch.setattr(mod, "PAGE", 5)
    respx.post(f"{B}/server/drug-source/").mock(side_effect=handler)
    out = client.drug_list()
    assert len(out) == 7
    assert out[0] == (rows[0]["internalID"], rows[0]["name"])
    assert [f["start"] for _, f in seen] == ["0", "5"]
    req, form = seen[0]
    assert form["csrfmiddlewaretoken"] == TOKEN
    assert form["length"] == "5" and form["draw"] == "1"
    assert req.headers["X-CSRFToken"] == TOKEN
    assert req.headers["X-Requested-With"] == "XMLHttpRequest"
    assert req.headers["Origin"] == B
    assert req.headers["Referer"] == f"{B}/server/drug/"
    assert req.headers["User-Agent"].startswith("bddrug-etl/0.2")
    keys = snap_keys(conn)
    assert "GET /server/drug/" in keys
    assert sum(k.startswith("POST /server/drug-source/") for k in keys) == 2
    stored = conn.execute("SELECT body FROM raw.http_snapshot WHERE source='ddinter' "
                          "AND request_key='GET /server/drug/'").fetchone()[0]
    assert TOKEN not in stored and "[redacted]" in stored


@respx.mock
def test_drug_list_full_page_size_stops_at_total(client):
    mock_session()
    page = {"recordsTotal": 1, "data": [{"name": "A", "internalID": "DDInter1"}]}
    route = respx.post(f"{B}/server/drug-source/").mock(return_value=httpx.Response(200, json=page))
    assert client.drug_list() == [("DDInter1", "A")]
    assert route.call_count == 1


@respx.mock
def test_csrf_token_falls_back_to_cookie_and_is_fetched_once(client):
    respx.get(f"{B}/server/drug/").mock(
        return_value=httpx.Response(200, text="<html></html>", headers={"set-cookie": "csrftoken=COOKIETOK; Path=/"}))
    route = respx.post(f"{B}/server/drug-source/").mock(
        return_value=httpx.Response(200, json={"recordsTotal": 0, "data": []}))
    client.drug_list()
    client.drug_list()
    assert httpx.QueryParams(route.calls[0].request.content.decode())["csrfmiddlewaretoken"] == "COOKIETOK"
    assert respx.calls.call_count == 3  # one session GET, two POSTs


@respx.mock
def test_post_error_body_raises(client):
    mock_session()
    respx.post(f"{B}/server/drug-source/").mock(
        return_value=httpx.Response(200, json={"msg": "error operation!", "status": "error"}))
    with pytest.raises(RuntimeError):
        client.drug_list()


@respx.mock
def test_drug_detail_get_and_snapshot(client, conn):
    respx.get(f"{B}/server/drug-detail/DDInter1951/").mock(
        return_value=httpx.Response(200, text=fx("detail_warfarin.html")))
    d = client.drug_detail("DDInter1951")
    assert (d.name, d.atc_codes, d.drugbank_id) == ("Warfarin", ("B01AA03",), "DB00682")
    assert snap_keys(conn) == ["GET /server/drug-detail/DDInter1951/"]


@respx.mock
def test_graph_lowercases_severity_and_actions(client, conn):
    respx.get(f"{B}/server/grapher-datasource/DDInter1951/").mock(
        return_value=httpx.Response(200, text=fx("graph_1951.json")))
    rows = client.graph("DDInter1951")
    assert len(rows) == 5
    assert rows[0] == DDInterPairRow("DDInter20", "Acetylsalicylic acid", "major", ("synergy",))
    assert snap_keys(conn) == ["GET /server/grapher-datasource/DDInter1951/"]


@respx.mock
def test_graph_missing_level_is_unknown(client):
    body = {"info": {}, "interactions": [{"id": "DDInter2", "name": "X", "level": [], "actions": []}]}
    respx.get(f"{B}/server/grapher-datasource/DDInter1/").mock(return_value=httpx.Response(200, json=body))
    assert client.graph("DDInter1") == [DDInterPairRow("DDInter2", "X", "unknown", ())]


@respx.mock
def test_pair_interaction_id_pages_and_matches_drug_id(client, conn):
    mock_session()
    p1, p2 = fxj("interact_with_p1.json"), fxj("interact_with_p2.json")
    starts = []

    def handler(request):
        form = dict(httpx.QueryParams(request.content.decode()))
        starts.append(form["start"])
        assert form["severity"] == "" and form["mechanism"] == ""
        assert request.headers["Referer"] == f"{B}/server/drug-detail/DDInter1951/"
        return httpx.Response(200, json=p1 if form["start"] == "0" else p2)

    respx.post(f"{B}/server/interact-with/DDInter1951/").mock(side_effect=handler)
    assert client.pair_interaction_id("DDInter1951", "DDInter9") == "3039"
    assert client.pair_interaction_id("DDInter1951", "DDInter999999") is None
    assert starts == ["0", "500"]
    assert any(k.startswith("POST /server/interact-with/DDInter1951/#") for k in snap_keys(conn))


@respx.mock
def test_diseases_level_mapped_and_references_split(client, conn):
    mock_session()
    respx.post(f"{B}/server/interact-with-dis/DDInter1951/").mock(
        return_value=httpx.Response(200, text=fx("disease_1951.json")))
    rows = client.diseases("DDInter1951")
    assert len(rows) == 2
    assert rows[0]["severity"] == "major"
    assert rows[0]["disease_name"] == "Hemorrhage"
    assert rows[0]["interaction_id"] == "3572"
    assert len(rows[0]["references"]) > 1 and all("|" not in r for r in rows[0]["references"])
    assert any(k.startswith("POST /server/interact-with-dis/DDInter1951/#") for k in snap_keys(conn))


@respx.mock
def test_foods_mechanism_from_magnesium_field(client, conn):
    mock_session()
    respx.post(f"{B}/server/interact-with-food/DDInter1951/").mock(
        return_value=httpx.Response(200, text=fx("food_1951.json")))
    rows = client.foods("DDInter1951")
    assert len(rows) == 2
    expected = fxj("food_1951.json")["data"][0]
    assert rows[0]["food_name"] == "alcohol"
    assert rows[0]["severity"] == "moderate"
    assert rows[0]["mechanism"] == expected["magnesium"].strip().lower()
    assert rows[0]["management"] == expected["newManagement"]
    assert any(k.startswith("POST /server/interact-with-food/DDInter1951/#") for k in snap_keys(conn))


@respx.mock
def test_interaction_page(client, conn):
    respx.get(f"{B}/server/interact/3039/").mock(return_value=httpx.Response(200, text=fx("interaction_3039.html")))
    t = client.interaction("3039")
    assert t.interaction and t.management and len(t.refs) == 3
    assert snap_keys(conn) == ["GET /server/interact/3039/"]


@respx.mock
def test_http_error_raises(client):
    respx.get(f"{B}/server/interact/1/").mock(return_value=httpx.Response(500, text="boom"))
    with pytest.raises(httpx.HTTPStatusError):
        client.interaction("1")


@respx.mock
def test_interact_with_map_is_memoised_per_drug(client):
    mock_session()
    p1, p2 = fxj("interact_with_p1.json"), fxj("interact_with_p2.json")
    route = respx.post(f"{B}/server/interact-with/DDInter1951/").mock(
        side_effect=lambda r: httpx.Response(
            200, json=p1 if dict(httpx.QueryParams(r.content.decode()))["start"] == "0" else p2))
    m = client.interact_with_map("DDInter1951")
    assert m["DDInter9"] == "3039" and m["DDInter1388"] == "122526"
    assert client.pair_interaction_id("DDInter1951", "DDInter20") == "34056"
    assert client.pair_interaction_id("DDInter1951", "DDInter9") == "3039"
    assert client.pair_interaction_id("DDInter1951", "DDInter404") is None
    assert route.call_count == 2  # one set of pages (start=0, start=500) for all lookups


@respx.mock
def test_drug_list_bad_records_total_raises(client):
    mock_session()
    for body in ({"data": [{"name": "A", "internalID": "DDInter1"}]},
                 {"recordsTotal": "abc", "data": [{"name": "A", "internalID": "DDInter1"}]}):
        respx.post(f"{B}/server/drug-source/").mock(return_value=httpx.Response(200, json=body))
        with pytest.raises(ValueError):
            client.drug_list()


def test_client_requires_one_second_interval(conn):
    http = SnapshotHttp(conn, "ddinter", httpx.Client(), 0.5, sleep=lambda s: None)
    with pytest.raises(AssertionError):
        DDInterClient(http)


@respx.mock
def test_disease_and_food_placeholder_texts_are_missing(client, conn):
    """DDInter prints "None" / "-" / nothing where it has no text: never passed on as text."""
    mock_session()
    dis = fxj("disease_1951.json")
    dis["data"][0]["text"], dis["data"][1]["text"] = "None", "  -  "
    food = fxj("food_1951.json")
    food["data"][0]["newInteraction"], food["data"][0]["newManagement"] = "N/A", ""
    food["data"][1]["newInteraction"], food["data"][1]["newManagement"] = None, "null"
    respx.post(f"{B}/server/interact-with-dis/DDInter1951/").mock(return_value=httpx.Response(200, json=dis))
    respx.post(f"{B}/server/interact-with-food/DDInter1951/").mock(return_value=httpx.Response(200, json=food))
    assert [r["text"] for r in client.diseases("DDInter1951")] == [None, None]
    assert [(r["interaction"], r["management"]) for r in client.foods("DDInter1951")] == [(None, None), (None, None)]


@respx.mock
def test_disease_and_food_real_texts_are_kept_stripped(client, conn):
    mock_session()
    dis = fxj("disease_1951.json")
    dis["data"][0]["text"] = "  Warfarin may worsen bleeding.  "
    respx.post(f"{B}/server/interact-with-dis/DDInter1951/").mock(return_value=httpx.Response(200, json=dis))
    assert client.diseases("DDInter1951")[0]["text"] == "Warfarin may worsen bleeding."
