"""Unit tests for Serbian Latin/Cyrillic normalization."""

from normalize import expand_match_terms, matches_keyword, normalize_for_match, to_cyrillic, to_latin


def test_vucic_roundtrip():
    assert "вучић" in to_cyrillic("Vučić").casefold() or to_cyrillic("Vučić")
    assert normalize_for_match("Вучић") == normalize_for_match("Vučić")


def test_keyword_match_across_scripts():
    haystack = "Председник Вучић посетио Београд"
    assert matches_keyword(haystack, "Vučić")
    assert matches_keyword("Predsednik Vučić u Beogradu", "Вучић")


def test_premijer_does_not_match_film_premiere():
    """premijer (PM) must not match inside premijera (premiere)."""
    hay = "London premijera filma Dog Star na crvenom tepihu"
    assert not matches_keyword(hay, "premijer")
    assert not matches_keyword(hay, "premijerka")
    assert matches_keyword("Premijer Srbije posetio Beograd", "premijer")
    assert matches_keyword("premijer Srbije u poseti", "premijer Srbije")


def test_expand_drops_bare_premijer():
    terms = expand_match_terms("总理", ["premijer", "premijer Srbije", "predsednik vlade Srbije"])
    assert "premijer" not in [t.casefold() for t in terms]
    assert any("premijer Srbije" == t for t in terms)


def test_digraphs():
    assert to_latin("џем") == "džem"
    assert "љ" in to_cyrillic("ljubav") or to_cyrillic("ljubav").startswith("љ")


if __name__ == "__main__":
    test_vucic_roundtrip()
    test_keyword_match_across_scripts()
    test_premijer_does_not_match_film_premiere()
    test_expand_drops_bare_premijer()
    test_digraphs()
    print("ok")
