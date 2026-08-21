"""Serbian Latin <-> Cyrillic transliteration and keyword normalization."""

from __future__ import annotations

from typing import Any

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


# Common Serbian inflectional / adjectival endings (longest first).
_SR_SUFFIXES = (
    "ijima",
    "ijama",
    "ovima",
    "evima",
    "ijem",
    "ijom",
    "ima",
    "ama",
    "oga",
    "ome",
    "omu",
    "ski",
    "ska",
    "sko",
    "cki",
    "cka",
    "cko",
    "ški",
    "ška",
    "ško",
    "ovi",
    "evi",
    "ama",
    "ima",
    "om",
    "em",
    "im",
    "og",
    "oj",
    "ih",
    "na",
    "ni",
    "ne",
    "no",
    "a",
    "e",
    "i",
    "u",
    "o",
)

# Query token → haystack full-forms that must NOT count as a hit (false friends).
_FALSE_FRIEND_HITS = {
    "premijer": frozenset({"premijera"}),
    "premijerka": frozenset({"premijera"}),
    # izbor = "choice/selection"; izbori / izbore / … = "elections"
    "izbori": frozenset({"izbor"}),
    "izbore": frozenset({"izbor"}),
    "izborima": frozenset({"izbor"}),
    "izborite": frozenset({"izbor"}),
}


def light_stem(word: str) -> str:
    """Cheap Serbian-ish stem for matching inflected newspaper forms."""
    w = normalize_for_match(word)
    if len(w) < 5:
        return w
    for suf in _SR_SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 4:
            return w[: -len(suf)]
    return w


def _haystack_words(haystack: str) -> list[str]:
    h = normalize_for_match(haystack)
    out: list[str] = []
    buf: list[str] = []
    for ch in h:
        if _is_word_char(ch):
            buf.append(ch)
        elif buf:
            out.append("".join(buf))
            buf = []
    if buf:
        out.append("".join(buf))
    return out


def _is_false_friend(query_token: str, hay_word: str) -> bool:
    q = normalize_for_match(query_token)
    w = normalize_for_match(hay_word)
    blocked = _FALSE_FRIEND_HITS.get(q) or _FALSE_FRIEND_HITS.get(light_stem(q))
    if not blocked:
        return False
    return w in blocked or any(w.startswith(b) and w != q for b in blocked)


def matches_token(haystack: str, token: str) -> bool:
    """Match one token allowing common Serbian inflections, with false-friend guards."""
    t = normalize_for_match(token)
    if not t:
        return False
    # Exact whole-token match first
    if matches_keyword_exact(haystack, t):
        return True
    stem = light_stem(t)
    if len(stem) < 4:
        return False
    for word in _haystack_words(haystack):
        if _is_false_friend(t, word):
            continue
        if word == t:
            return True
        w_stem = light_stem(word)
        if w_stem == stem:
            return True
        # izbor* family: izbori / izbore / izborima / izborna
        if len(stem) >= 4 and (word.startswith(stem) or stem.startswith(w_stem) and len(w_stem) >= 4):
            if _is_false_friend(t, word):
                continue
            return True
    return False


def matches_keyword_exact(haystack: str, keyword: str) -> bool:
    """Contiguous phrase match with word boundaries (no stemming)."""
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
    "srbiji",
    "srbiju",
    "srbijom",
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
    "u",
    "i",
    "na",
    "od",
    "za",
    "sa",
    "se",
    "je",
    "su",
    "a",
    "the",
    "of",
    "and",
}


def content_tokens(term: str) -> list[str]:
    """Non-stopword tokens from a search phrase."""
    parts = normalize_for_match(term).split()
    return [p for p in parts if p and p not in MATCH_STOPWORDS]


def matches_keyword(haystack: str, keyword: str) -> bool:
    """True if keyword matches haystack, with inflection + multi-word AND fallback.

    - Contiguous phrase with word boundaries (preferred)
    - Else all content tokens match via light stemming (handles izbori→izbore)
    - Guards false friends like premijer vs premijera
    """
    k = normalize_for_match(keyword)
    if not k:
        return False
    if matches_keyword_exact(haystack, k):
        return True
    toks = content_tokens(k)
    if not toks:
        return False
    # Year-only leftovers are useless
    toks = [t for t in toks if not t.isdigit()]
    if not toks:
        return False
    return all(matches_token(haystack, t) for t in toks)


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
    """Build match terms. Keep AI phrases; also emit distinctive content cores."""
    raw = [t.strip() for t in (search_terms or []) if str(t).strip()]
    base = raw if raw else ([phrase.strip()] if phrase and phrase.strip() else [])
    out: list[str] = []
    seen: set[str] = set()

    def add(term: str) -> None:
        key = normalize_for_match(term)
        if not key or key in seen or key in MATCH_STOPWORDS:
            return
        if key.isdigit():
            return
        # Reject broad single tokens
        if " " not in term.strip() and key in BROAD_SINGLE_TERMS:
            return
        seen.add(key)
        out.append(term.strip())

    for term in base:
        add(term)
        # If a phrase collapses to one distinctive content token (e.g. "izbori u Srbiji" → izbori),
        # keep that core so inflected headlines match without dragging in noisy words like "proces".
        cores = [t for t in content_tokens(term) if not t.isdigit()]
        if len(cores) == 1 and len(cores[0]) >= 5 and cores[0] not in BROAD_SINGLE_TERMS:
            add(cores[0])

    # If AI only gave broad singles, keep the most specific multi-word-looking combos
    # by pairing china-ish + migrant-ish when possible.
    if not out and raw:
        china = [
            t
            for t in raw
            if normalize_for_match(t) in {"kina", "kineski", "chinese", "china"}
            or "kines" in normalize_for_match(t)
        ]
        migr = [t for t in raw if any(x in normalize_for_match(t) for x in ("migr", "imigr", "ilegal"))]
        for c in china[:2]:
            for m in migr[:2]:
                add(f"{c} {m}")

    if not out:
        # Last resort: original user phrase (may be Chinese — then crawl will find nothing until AI expands well)
        add(phrase)

    return out


def clean_match_groups(raw: Any) -> list[list[str]]:
    """Normalize AI/DB match_groups into [[variant, …], …]."""
    if not isinstance(raw, list):
        return []
    groups: list[list[str]] = []
    for g in raw:
        if not isinstance(g, list):
            continue
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in g:
            s = str(item).strip()
            if not s:
                continue
            key = normalize_for_match(s)
            if not key or key in seen or key.isdigit() or key in MATCH_STOPWORDS:
                continue
            if " " not in s and key in BROAD_SINGLE_TERMS:
                continue
            seen.add(key)
            cleaned.append(s[:80])
        if cleaned:
            groups.append(cleaned[:12])
    return groups[:6]


def suggest_match_mode(phrase: str) -> str:
    """Long Chinese / long intents → strict (AND groups); short topics → loose."""
    p = (phrase or "").strip()
    cjk = sum(1 for ch in p if "\u4e00" <= ch <= "\u9fff")
    if cjk >= 8 or len(p) >= 24:
        return "strict"
    return "loose"


def haystack_for_article(article: dict[str, Any]) -> tuple[str, str]:
    hay = f"{article.get('title', '')} {article.get('summary', '')}"
    normalized = article.get("raw_text_normalized") or normalize_for_match(hay)
    return hay, normalized


def phrase_hits(hay: str, normalized: str, phrase: str) -> bool:
    return matches_keyword(normalized, phrase) or matches_keyword(hay, phrase)


def article_matches_loose(article: dict[str, Any], terms: list[str]) -> bool:
    """OR across precise terms (inflection-aware)."""
    if not terms:
        return False
    hay, normalized = haystack_for_article(article)
    return any(phrase_hits(hay, normalized, term) for term in terms)


def article_matches_strict(article: dict[str, Any], groups: list[list[str]]) -> bool:
    """AND across groups; OR within each group (language variants)."""
    if not groups:
        return False
    hay, normalized = haystack_for_article(article)
    for group in groups:
        if not group:
            return False
        if not any(phrase_hits(hay, normalized, alt) for alt in group):
            return False
    return True


def article_matches_keyword_row(article: dict[str, Any], row: dict[str, Any]) -> bool:
    """Match one user keyword using strict groups or loose terms."""
    mode = (row.get("match_mode") or "").strip() or suggest_match_mode(row.get("phrase") or "")
    groups = clean_match_groups(row.get("match_groups"))
    if mode == "strict" and groups:
        return article_matches_strict(article, groups)
    terms = expand_match_terms(row.get("phrase") or "", row.get("search_terms") or [])
    # If AI returned groups but mode loose, still allow OR of flattened variants
    if not terms and groups:
        terms = [alt for g in groups for alt in g]
    return article_matches_loose(article, terms)


# Backward-compatible alias
def article_matches_groups(haystack: str, terms: list[str]) -> bool:
    if not terms:
        return False
    return any(matches_keyword(haystack, term) for term in terms)
