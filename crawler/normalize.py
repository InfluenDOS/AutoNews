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


def _is_word_char(ch: str) -> bool:
    return ch.isalnum()


def matches_keyword(haystack: str, keyword: str) -> bool:
    """True if keyword appears as a whole token/phrase (not a substring of a longer word).

    Prevents false friends like premijer (PM) matching inside premijera (premiere).
    """
    h = normalize_for_match(haystack)
    k = normalize_for_match(keyword)
    if not k:
        return False
    start = 0
    while True:
        i = h.find(k, start)
        if i < 0:
            return False
        before_ok = i == 0 or not _is_word_char(h[i - 1])
        after = i + len(k)
        after_ok = after >= len(h) or not _is_word_char(h[after])
        if before_ok and after_ok:
            return True
        start = i + 1


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

# Too broad alone — cause false positives (any migrant story, any China mention, etc.)
BROAD_SINGLE_TERMS = {
    "kina",
    "kineski",
    "kineska",
    "kinesko",
    "chinese",
    "china",
    "migranti",
    "migrant",
    "imigranti",
    "imigrant",
    "ilegalni",
    "ilegalno",
    "illegal",
    "investicije",
    "politika",
    "ekonomija",
    "diplomatija",
    "trgovina",
    "tehnologija",
    "vojska",
    "kultura",
    "sport",
    # Political titles alone are noisy; also premijer ⊂ premijera (film premiere)
    "premijer",
    "premijerka",
    "premijera",
    "predsednik",
    "predsednica",
    "vlade",
    "vlada",
}


def expand_match_terms(phrase: str, search_terms: list[str] | None = None) -> list[str]:
    """Build precise match terms. Prefer multi-word phrases; skip broad singles."""
    raw = [t.strip() for t in (search_terms or []) if str(t).strip()]
    base = raw if raw else ([phrase.strip()] if phrase and phrase.strip() else [])
    out: list[str] = []
    seen: set[str] = set()

    def add(term: str) -> None:
        key = normalize_for_match(term)
        if not key or key in seen or key in MATCH_STOPWORDS:
            return
        # Reject broad single tokens
        if " " not in term.strip() and key in BROAD_SINGLE_TERMS:
            return
        seen.add(key)
        out.append(term.strip())

    for term in base:
        add(term)

    # If AI only gave broad singles, keep the most specific multi-word-looking combos
    # by pairing china-ish + migrant-ish when possible.
    if not out and raw:
        china = [t for t in raw if normalize_for_match(t) in {"kina", "kineski", "chinese", "china"} or "kines" in normalize_for_match(t)]
        migr = [t for t in raw if any(x in normalize_for_match(t) for x in ("migr", "imigr", "ilegal"))]
        for c in china[:2]:
            for m in migr[:2]:
                add(f"{c} {m}")

    if not out:
        # Last resort: original user phrase (may be Chinese — then crawl will find nothing until AI expands well)
        add(phrase)

    return out


def article_matches_groups(haystack: str, terms: list[str]) -> bool:
    """OR across precise terms (word-boundary aware)."""
    if not terms:
        return False
    return any(matches_keyword(haystack, term) for term in terms)
