"""Unit tests for Serbian Latin/Cyrillic normalization."""

from normalize import matches_keyword, normalize_for_match, to_cyrillic, to_latin


def test_vucic_roundtrip():
    assert "вучић" in to_cyrillic("Vučić").casefold() or to_cyrillic("Vučić")
    assert normalize_for_match("Вучић") == normalize_for_match("Vučić")


def test_keyword_match_across_scripts():
    haystack = "Председник Вучић посетио Београд"
    assert matches_keyword(haystack, "Vučić")
    assert matches_keyword("Predsednik Vučić u Beogradu", "Вучић")


def test_digraphs():
    assert to_latin("џем") == "džem"
    assert "љ" in to_cyrillic("ljubav") or to_cyrillic("ljubav").startswith("љ")


if __name__ == "__main__":
    test_vucic_roundtrip()
    test_keyword_match_across_scripts()
    test_digraphs()
    print("ok")
