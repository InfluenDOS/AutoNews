"""Serbian Latin <-> Cyrillic transliteration and keyword normalization."""

from __future__ import annotations

# Digraphs must be processed before single letters
LATIN_TO_CYRILLIC = [
    ("dž", "џ"),
    ("Dž", "Џ"),
    ("DŽ", "Џ"),
    ("lj", "љ"),
    ("Lj", "Љ"),
    ("LJ", "Љ"),
    ("nj", "њ"),
    ("Nj", "Њ"),
    ("NJ", "Њ"),
    ("a", "а"),
    ("A", "А"),
    ("b", "б"),
    ("B", "Б"),
    ("v", "в"),
    ("V", "В"),
    ("g", "г"),
    ("G", "Г"),
    ("d", "д"),
    ("D", "Д"),
    ("đ", "ђ"),
    ("Đ", "Ђ"),
    ("e", "е"),
    ("E", "Е"),
    ("ž", "ж"),
    ("Ž", "Ж"),
    ("z", "з"),
    ("Z", "З"),
    ("i", "и"),
    ("I", "И"),
    ("j", "ј"),
    ("J", "Ј"),
    ("k", "к"),
    ("K", "К"),
    ("l", "л"),
    ("L", "Л"),
    ("m", "м"),
    ("M", "М"),
    ("n", "н"),
    ("N", "Н"),
    ("o", "о"),
    ("O", "О"),
    ("p", "п"),
    ("P", "П"),
    ("r", "р"),
    ("R", "Р"),
    ("s", "с"),
    ("S", "С"),
    ("t", "т"),
    ("T", "Т"),
    ("ć", "ћ"),
    ("Ć", "Ћ"),
    ("u", "у"),
    ("U", "У"),
    ("f", "ф"),
    ("F", "Ф"),
    ("h", "х"),
    ("H", "Х"),
    ("c", "ц"),
    ("C", "Ц"),
    ("č", "ч"),
    ("Č", "Ч"),
    ("š", "ш"),
    ("Š", "Ш"),
]

CYRILLIC_TO_LATIN = [
    ("џ", "dž"),
    ("Џ", "Dž"),
    ("љ", "lj"),
    ("Љ", "Lj"),
    ("њ", "nj"),
    ("Њ", "Nj"),
    ("а", "a"),
    ("А", "A"),
    ("б", "b"),
    ("Б", "B"),
    ("в", "v"),
    ("В", "V"),
    ("г", "g"),
    ("Г", "G"),
    ("д", "d"),
    ("Д", "D"),
    ("ђ", "đ"),
    ("Ђ", "Đ"),
    ("е", "e"),
    ("Е", "E"),
    ("ж", "ž"),
    ("Ж", "Ž"),
    ("з", "z"),
    ("З", "Z"),
    ("и", "i"),
    ("И", "I"),
    ("ј", "j"),
    ("Ј", "J"),
    ("к", "k"),
    ("К", "K"),
    ("л", "l"),
    ("Л", "L"),
    ("м", "m"),
    ("М", "M"),
    ("н", "n"),
    ("Н", "N"),
    ("о", "o"),
    ("О", "O"),
    ("п", "p"),
    ("П", "P"),
    ("р", "r"),
    ("Р", "R"),
    ("с", "s"),
    ("С", "S"),
    ("т", "t"),
    ("Т", "T"),
    ("ћ", "ć"),
    ("Ћ", "Ć"),
    ("у", "u"),
    ("У", "U"),
    ("ф", "f"),
    ("Ф", "F"),
    ("х", "h"),
    ("Х", "H"),
    ("ц", "c"),
    ("Ц", "C"),
    ("ч", "č"),
    ("Ч", "Č"),
    ("ш", "š"),
    ("Ш", "Š"),
]


def _apply_map(text: str, mapping: list[tuple[str, str]]) -> str:
    result = text
    for src, dst in mapping:
        result = result.replace(src, dst)
    return result


def to_latin(text: str) -> str:
    return _apply_map(text, CYRILLIC_TO_LATIN)


def to_cyrillic(text: str) -> str:
    return _apply_map(text, LATIN_TO_CYRILLIC)


def normalize_for_match(text: str) -> str:
    """Lowercase Latin form used for keyword matching."""
    if not text:
        return ""
    return to_latin(text).casefold().strip()


def matches_keyword(haystack: str, keyword: str) -> bool:
    """Return True if keyword appears in haystack after Latin/Cyrillic normalization."""
    h = normalize_for_match(haystack)
    k = normalize_for_match(keyword)
    if not k:
        return False
    return k in h


MATCH_STOPWORDS = {
    "srbija",
    "serbia",
    "balkan",
    "beograd",
    "belgrade",
    "evropa",
    "europa",
    "europe",
    "vesti",
    "news",
    "world",
    "svet",
}


def expand_match_terms(phrase: str, search_terms: list[str] | None = None) -> list[str]:
    """Build match terms from AI search_terms (preferred) or the raw phrase."""
    raw = [t.strip() for t in (search_terms or []) if str(t).strip()]
    base = raw if raw else ([phrase.strip()] if phrase and phrase.strip() else [])
    out: list[str] = []
    seen: set[str] = set()
    for term in base:
        parts = [term, *[w for w in term.replace(",", " ").split() if len(w) >= 4]]
        for part in parts:
            key = normalize_for_match(part)
            if not key or key in seen or key in MATCH_STOPWORDS:
                continue
            seen.add(key)
            out.append(part)
    if not out:
        for term in base:
            key = normalize_for_match(term)
            if key and key not in seen:
                seen.add(key)
                out.append(term)
    return out
