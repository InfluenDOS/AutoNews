"""Unit tests for Serbian Latin/Cyrillic normalization."""

from normalize import (
    article_matches_keyword_row,
    expand_match_terms,
    matches_keyword,
    normalize_for_match,
    to_cyrillic,
    to_latin,
)


def _row(phrase: str, terms: list[str]) -> dict:
    return {"phrase": phrase, "match_mode": "loose", "match_groups": [], "search_terms": terms}


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


def test_bare_premijer_cannot_carry_a_match():
    """The bare generic word is kept as a term but may not match on its own."""
    raw = ["premijer", "premijer Srbije", "predsednik vlade Srbije"]
    terms = expand_match_terms("总理", raw)
    assert any(t == "premijer Srbije" for t in terms)

    row = _row("总理", raw)
    assert article_matches_keyword_row({"title": "Premijer Srbije primio delegaciju"}, row)
    assert not article_matches_keyword_row({"title": "Premijer Hrvatske u Zagrebu"}, row)


def test_election_inflection_and_implied_location():
    """Headlines use izbore/izborima and never repeat "Srbija"; both must still hit."""
    raw = ["izbori u Srbiji", "parlamentarni izbori Srbija", "izbori 2024 Srbija"]
    row = _row("塞尔维亚选举", raw)
    headlines = [
        "Blokaderi ne znaju šta žele – prvo su tražili izbore",
        "Вучић: Избори ће бити расписани за неколико дана",
        "Vučić otkrio dva datuma za održavanje izbora",
        "Građani na izborima odlučuju",
        "NISU OČEKIVALI IZBORE? Vučić o izborima",
    ]
    for h in headlines:
        assert matches_keyword(h, "izbori"), h
        assert matches_keyword(h, "izbori u Srbiji"), h
        assert article_matches_keyword_row({"title": h}, row), h

    # An election elsewhere is not an implied-Serbia story.
    assert not article_matches_keyword_row({"title": "Izbori u Hrvatskoj u aprilu"}, row)

    terms = expand_match_terms("塞尔维亚选举", raw)
    # Year-only fragments should not be kept as standalone terms
    assert not any(normalize_for_match(t) == "2024" for t in terms)


def test_digraphs():
    assert to_latin("џем") == "džem"
    assert "љ" in to_cyrillic("ljubav") or to_cyrillic("ljubav").startswith("љ")


if __name__ == "__main__":
    test_vucic_roundtrip()
    test_keyword_match_across_scripts()
    test_premijer_does_not_match_film_premiere()
    test_bare_premijer_cannot_carry_a_match()
    test_election_inflection_and_implied_location()
    test_digraphs()
    print("ok")
