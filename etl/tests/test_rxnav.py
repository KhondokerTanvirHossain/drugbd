import json, pathlib
import httpx, pytest, respx
from bddrug_etl.rxnav.client import RxNavClient, RxCodes

FIX = pathlib.Path(__file__).parent / "fixtures/rxnav"
B = RxNavClient.BASE


def fx(name):
    return json.loads((FIX / name).read_text())


class FakeSnap:
    """Same get() contract as SnapshotHttp, without the DB."""

    def __init__(self):
        self.http = httpx.Client()

    def get(self, url, params=None):
        return self.http.get(url, params=params)


@pytest.fixture
def client():
    with respx.mock(assert_all_called=False) as m:
        yield RxNavClient(FakeSnap()), m


def test_exact_name_resolves_paracetamol(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "Paracetamol", "search": "2"}).respond(json=fx("paracetamol_rxcui.json"))
    m.get(f"{B}/rxcui/161/properties.json").respond(json=fx("161_properties.json"))
    assert c.rxcui_for_name("Paracetamol") == ("161", "rxnav-exact")


def test_pin_follows_to_in(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "Clavulanic acid", "search": "2"}).respond(json=fx("clavulanic_rxcui.json"))
    m.get(f"{B}/rxcui/21216/properties.json").respond(json=fx("21216_properties.json"))
    m.get(f"{B}/rxcui/21216/related.json", params={"tty": "IN"}).respond(json=fx("21216_related_in.json"))
    assert c.rxcui_for_name("Clavulanic acid") == ("48203", "rxnav-exact")


def test_codes_for_paracetamol(client):
    c, m = client
    m.get(f"{B}/rxcui/161/properties.json").respond(json=fx("161_properties.json"))
    m.get(f"{B}/rxcui/161/allProperties.json", params={"prop": "codes"}).respond(json=fx("161_codes.json"))
    codes = c.codes_for_rxcui("161")
    assert codes == RxCodes("161", "acetaminophen", "IN", ("N02BE01",), ("DB00316",), ("387517004", "90332006"))


def test_five_char_atc_class_is_ignored(client):
    c, m = client
    data = fx("161_codes.json")
    data["propConceptGroup"]["propConcept"] += [
        {"propCategory": "CODES", "propName": "ATC", "propValue": "N02BE"},
        {"propCategory": "CODES", "propName": "ATC", "propValue": "N02BE01"},  # duplicate collapsed
    ]
    m.get(f"{B}/rxcui/161/properties.json").respond(json=fx("161_properties.json"))
    m.get(f"{B}/rxcui/161/allProperties.json", params={"prop": "codes"}).respond(json=data)
    assert c.codes_for_rxcui("161").atc == ("N02BE01",)


def test_unknown_name_returns_none(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "Zzzqx notadrug", "search": "2"}).respond(json=fx("notfound_rxcui.json"))
    m.get(f"{B}/approximateTerm.json", params={"term": "Zzzqx notadrug", "maxEntries": "1"}).respond(json=fx("notfound_approx.json"))
    assert c.rxcui_for_name("Zzzqx notadrug") is None


def test_approximate_match_above_threshold(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "Amoxicilin", "search": "2"}).respond(json=fx("amoxicilin_rxcui.json"))
    m.get(f"{B}/approximateTerm.json", params={"term": "Amoxicilin", "maxEntries": "1"}).respond(json=fx("amoxicilin_approx.json"))
    m.get(f"{B}/rxcui/723/properties.json").respond(json=fx("723_properties.json"))
    assert c.rxcui_for_name("Amoxicilin") == ("723", "rxnav-approx")


def test_approximate_match_below_threshold_rejected(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "Parasetamol", "search": "2"}).respond(json=fx("parasetamol_rxcui.json"))
    m.get(f"{B}/approximateTerm.json", params={"term": "Parasetamol", "maxEntries": "1"}).respond(json=fx("parasetamol_approx.json"))
    assert c.rxcui_for_name("Parasetamol") is None
