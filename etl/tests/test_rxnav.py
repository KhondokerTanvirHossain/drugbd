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


def _props(rxcui, name, tty):
    return {"properties": {"rxcui": rxcui, "name": name, "tty": tty}}


def _related(*ins):
    return {"relatedGroup": {"conceptGroup": [{"tty": "IN", "conceptProperties": [
        {"rxcui": r, "name": n, "tty": "IN"} for r, n in ins]}]}}


def _approx(*cands):
    return {"approximateGroup": {"candidate": [
        {"rxcui": r, "score": str(sc), "rank": "1"} for r, sc in cands]}}


def _approx_only(m, term, approx):
    m.get(f"{B}/rxcui.json", params={"name": term, "search": "2"}).respond(json={"idGroup": {}})
    m.get(f"{B}/approximateTerm.json", params={"term": term, "maxEntries": "1"}).respond(json=approx)


def test_approx_tie_between_different_rxcuis_is_rejected(client):
    c, m = client
    _approx_only(m, "tie", _approx(("111", 9.0), ("222", 9.0)))
    m.get(f"{B}/rxcui/111/properties.json").respond(json=_props("111", "a", "IN"))
    m.get(f"{B}/rxcui/222/properties.json").respond(json=_props("222", "b", "IN"))
    assert c.rxcui_for_name("tie") is None


@pytest.mark.parametrize("tty", ["BN", "SCD"])
def test_approx_non_ingredient_is_rejected(client, tty):
    c, m = client
    _approx_only(m, "brandy", _approx(("333", 9.0)))
    m.get(f"{B}/rxcui/333/properties.json").respond(json=_props("333", "x", tty))
    assert c.rxcui_for_name("brandy") is None


def test_pin_with_several_ins_picks_name_prefix_of_first_word(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "foo hydrochloride", "search": "2"}).respond(json={"idGroup": {"rxnormId": ["50"]}})
    m.get(f"{B}/rxcui/50/properties.json").respond(json=_props("50", "foo hydrochloride", "PIN"))
    m.get(f"{B}/rxcui/50/related.json", params={"tty": "IN"}).respond(json=_related(("60", "bar"), ("61", "Foo")))
    assert c.rxcui_for_name("foo hydrochloride") == ("61", "rxnav-exact")


def test_pin_with_ambiguous_or_no_in_returns_none(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "foo salt", "search": "2"}).respond(json={"idGroup": {"rxnormId": ["50"]}})
    m.get(f"{B}/rxcui/50/properties.json").respond(json=_props("50", "foo salt", "PIN"))
    related = m.get(f"{B}/rxcui/50/related.json", params={"tty": "IN"})
    related.respond(json=_related(("60", "bar"), ("61", "baz")))
    assert c.rxcui_for_name("foo salt") is None
    related.respond(json=_related(("60", "foo"), ("61", "fo")))  # both prefixes of "foo"
    assert c.rxcui_for_name("foo salt") is None
    related.respond(json={"relatedGroup": {"conceptGroup": []}})
    assert c.rxcui_for_name("foo salt") is None


def test_properties_404_returns_none(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "ghost", "search": "2"}).respond(json={"idGroup": {"rxnormId": ["9"]}})
    m.get(f"{B}/rxcui/9/properties.json").respond(404)
    assert c.rxcui_for_name("ghost") is None


def test_exact_multiple_ids_prefers_the_single_in(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "multi", "search": "2"}).respond(json={"idGroup": {"rxnormId": ["1", "2"]}})
    m.get(f"{B}/rxcui/1/properties.json").respond(json=_props("1", "multi brand", "BN"))
    m.get(f"{B}/rxcui/2/properties.json").respond(json=_props("2", "multi", "IN"))
    assert c.rxcui_for_name("multi") == ("2", "rxnav-exact")


def test_exact_multiple_ids_ambiguous_returns_none(client):
    c, m = client
    m.get(f"{B}/rxcui.json", params={"name": "multi", "search": "2"}).respond(json={"idGroup": {"rxnormId": ["1", "2"]}})
    m.get(f"{B}/rxcui/1/properties.json").respond(json=_props("1", "a", "IN"))
    m.get(f"{B}/rxcui/2/properties.json").respond(json=_props("2", "b", "IN"))
    assert c.rxcui_for_name("multi") is None
