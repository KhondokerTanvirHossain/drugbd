import httpx, respx
from bddrug_etl.ocl.client import OclClient

BASE = "https://ocl.test"
URL = f"{BASE}/orgs/MoHFW/sources/DGDA-Drugs/concepts/"

@respx.mock
def test_iter_concepts_follows_next_header_until_absent():
    respx.get(URL, params={"page": "2"}).mock(
        return_value=httpx.Response(200, json=[{"id": "c3"}]))
    respx.get(URL).mock(return_value=httpx.Response(
        200, json=[{"id": "c1"}, {"id": "c2"}], headers={"next": f"{URL}?page=2"}))
    client = OclClient(BASE, httpx.Client(), page_size=2, pause_s=0)
    assert [c["id"] for c in client.iter_concepts("MoHFW", "DGDA-Drugs")] == ["c1", "c2", "c3"]

@respx.mock
def test_iter_concepts_treats_literal_none_next_as_end():
    respx.get(URL).mock(return_value=httpx.Response(200, json=[{"id": "c1"}], headers={"next": "None"}))
    client = OclClient(BASE, httpx.Client(), pause_s=0)
    assert [c["id"] for c in client.iter_concepts("MoHFW", "DGDA-Drugs")] == ["c1"]

@respx.mock
def test_iter_concepts_raises_on_http_error():
    respx.get(URL).mock(return_value=httpx.Response(503))
    client = OclClient(BASE, httpx.Client(), pause_s=0)
    import pytest
    with pytest.raises(httpx.HTTPStatusError):
        list(client.iter_concepts("MoHFW", "DGDA-Drugs"))

@respx.mock
def test_get_concept_requests_verbose_with_mappings():
    route = respx.get(f"{URL}341-0160-020--tericin/").mock(
        return_value=httpx.Response(200, json={"id": "341-0160-020--tericin"}))
    client = OclClient(BASE, httpx.Client(), pause_s=0)
    assert client.get_concept("MoHFW", "DGDA-Drugs", "341-0160-020--tericin")["id"] == "341-0160-020--tericin"
    assert route.calls.last.request.url.params["includeMappings"] == "true"

@respx.mock
def test_get_concept_returns_none_on_404():
    respx.get(f"{URL}nope/").mock(return_value=httpx.Response(404))
    assert OclClient(BASE, httpx.Client(), pause_s=0).get_concept("MoHFW", "DGDA-Drugs", "nope") is None
