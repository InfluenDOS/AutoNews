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

# Query token → exact haystack forms that must NOT count as a hit (false friends).
# Matched exactly: `izbori` must still reach `izborni` (electoral), just not `izbor` (a choice).
# Only unambiguous wrong-sense forms belong here. `izbora` and `izboru` are left out on
# purpose: they are the ordinary way to write "of/at the elections" (datum izbora), so
# blocking them would cost more than the occasional "depending on your selection". Cases
# that need real context are handled by the AI's exclude_terms and the stage-2 pass.
_FALSE_FRIEND_HITS = {
    # premijer = prime minister; premijera = film premiere
    "premijer": frozenset({"premijera"}),
    "premijerka": frozenset({"premijera"}),
    # izbor = "choice/selection"; izbori / izbore / izborni = "elections"
    "izbori": frozenset({"izbor"}),
    "izbore": frozenset({"izbor"}),
    "izborima": frozenset({"izbor"}),
    "izborite": frozenset({"izbor"}),
}


_MIN_STEM = 4


def light_stem(word: str) -> str:
    """Cheap Serbian-ish stem for matching inflected newspaper forms."""
    w = normalize_for_match(word)
    if len(w) < 5:
        return w
    for suf in _SR_SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= _MIN_STEM:
            return w[: -len(suf)]
    return w


_VOWELS = frozenset("aeiou")


def _drop_fugitive_a(form: str) -> str | None:
    """Serbian «nepostojano a»: migranat → migrant, sastanak → sastank."""
    if len(form) < 5 or form[-1] in _VOWELS or form[-2] != "a" or form[-3] in _VOWELS:
        return None
    return form[:-2] + form[-1]


def stem_candidates(word: str) -> set[str]:
    """Word plus every form obtained by stripping ONE known inflectional ending.

    Two words are treated as the same lemma when their candidate sets overlap.
    Unlike prefix matching this refuses `vlada`→`Vladimir` / `kineski`→`kinematografija`,
    because the extra characters must be a recognised Serbian ending.
    """
    w = normalize_for_match(word)
    if not w:
        return set()
    out = {w}
    if len(w) < 5:
        return out
    for suf in _SR_SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= _MIN_STEM:
            out.add(w[: -len(suf)])
    for form in list(out):
        collapsed = _drop_fugitive_a(form)
        if collapsed and len(collapsed) >= _MIN_STEM:
            out.add(collapsed)
    return out


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
    return bool(blocked) and w in blocked


def matches_token(haystack: str, token: str) -> bool:
    """Match one token allowing common Serbian inflections, with false-friend guards."""
    t = normalize_for_match(token)
    if not t:
        return False
    # Exact whole-token match first
    if matches_keyword_exact(haystack, t):
        return True
    t_forms = {c for c in stem_candidates(t) if len(c) >= _MIN_STEM}
    if not t_forms:
        return False
    for word in _haystack_words(haystack):
        if _is_false_friend(t, word):
            continue
        if word == t:
            return True
        if t_forms & {c for c in stem_candidates(word) if len(c) >= _MIN_STEM}:
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
    # Function words only — do NOT put place names here.
    # (Places as stopwords broke phrases like "Serbia seasons" → only "seasons".)
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


# A domestic newsroom does not repeat its own country: an AI term like "izbori u Srbiji"
# has to match the headline "prvo su tražili izbore".
_IMPLIED_LOCATION_STEMS = ("srbij", "serbia", "serbian", "balkan", "beograd", "belgrad")

# …but only when the story is not about somewhere else instead.
_OTHER_COUNTRIES = (
    "Hrvatska",
    "Croatia",
    "Bosna",
    "Bosnia",
    "Hercegovina",
    "Crna Gora",
    "Montenegro",
    "Makedonija",
    "Macedonia",
    "Slovenija",
    "Slovenia",
    "Kosovo",
    "Albanija",
    "Albania",
    "Bugarska",
    "Bulgaria",
    "Rumunija",
    "Romania",
    "Mađarska",
    "Madjarska",
    "Hungary",
    "Grčka",
    "Greece",
    "Turska",
    "Turkey",
    "Rusija",
    "Russia",
    "Ukrajina",
    "Ukraine",
    "Nemačka",
    "Germany",
    "Francuska",
    "France",
    "Italija",
    "Italy",
    "Austrija",
    "Austria",
    "Poljska",
    "Poland",
)


def _is_implied_location(token: str) -> bool:
    t = normalize_for_match(token)
    return any(t.startswith(stem) for stem in _IMPLIED_LOCATION_STEMS)


def mentions_other_country(haystack: str, allowed_tokens: list[str]) -> bool:
    """True if the text names a country the search term did not ask for."""
    allowed = {normalize_for_match(t) for t in allowed_tokens}
    for country in _OTHER_COUNTRIES:
        toks = content_tokens(country)
        if not toks or any(t in allowed for t in toks):
            continue
        if matches_keyword_exact(haystack, country) or all(
            matches_token(haystack, t) for t in toks
        ):
            return True
    return False


def matches_keyword(haystack: str, keyword: str) -> bool:
    """True if keyword matches haystack, with inflection + multi-word AND fallback.

    - Contiguous phrase with word boundaries (preferred)
    - Else all content tokens match via light stemming (handles izbori→izbore)
    - A local-location token may be implied, unless the story names another country
    - Guards false friends like premijer vs premijera
    """
    k = normalize_for_match(keyword)
    if not k:
        return False
    if matches_keyword_exact(haystack, k):
        return True
    # Year-only leftovers are useless
    toks = [t for t in content_tokens(k) if not t.isdigit()]
    if not toks:
        return False
    missing = [t for t in toks if not matches_token(haystack, t)]
    if not missing:
        return True
    if not all(_is_implied_location(t) for t in missing):
        return False
    # Implying the country is only safe when something distinctive did match: `vlada` alone
    # would otherwise pull in the given name Vlado, `premijer` alone any prime minister.
    present = [t for t in toks if t not in missing]
    if not any(t not in GENERIC_TERMS for t in present):
        return False
    return not mentions_other_country(haystack, toks)


# Generic on their own: they describe a whole beat, not a story. They are kept as
# search terms but weighted down, so they can narrow a match without carrying one.
GENERIC_TERMS = {
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
    # Places — fine inside phrases, too broad alone
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
    # Climate/weather alone matches any "Season 3" trailer etc.
    "climate",
    "weather",
    "season",
    "seasons",
    "temperature",
    "precipitation",
}


WEIGHT_PHRASE = 1.0
WEIGHT_DISTINCTIVE = 0.8
WEIGHT_SHORT = 0.5
WEIGHT_GENERIC = 0.3

# A term at or above this weight is specific enough to justify a hit on its own.
SELF_SUFFICIENT_WEIGHT = WEIGHT_SHORT
# Share of total facet weight an article must cover.
MIN_COVERAGE = 0.6
RECALL_MIN_COVERAGE = 0.45


def term_weight(term: str) -> float:
    """How much evidence one search term carries. Phrases beat bare generic words."""
    toks = [t for t in content_tokens(term) if not t.isdigit()]
    if not toks:
        return 0.0
    if len(toks) >= 2:
        return WEIGHT_PHRASE
    tok = toks[0]
    if tok in GENERIC_TERMS:
        return WEIGHT_GENERIC
    if len(tok) >= 5:
        return WEIGHT_DISTINCTIVE
    return WEIGHT_SHORT


def facet_weight(group: list[str]) -> float:
    """A facet is as specific as its most specific language variant."""
    return max((term_weight(alt) for alt in group), default=0.0)


def allowed_facet_misses(count: int) -> int:
    """How many facets an article may leave implicit.

    AI over-decomposes long intents, and newsrooms imply context instead of spelling it
    out, so full AND across every facet rejects obviously on-topic stories. Two facets
    stay mandatory because there is nothing left to corroborate a single hit.
    """
    if count <= 2:
        return 0
    if count <= 4:
        return 1
    return 2


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
        seen.add(key)
        out.append(term.strip())

    for term in base:
        add(term)
        # If a phrase collapses to one distinctive content token (e.g. "izbori u Srbiji" → izbori),
        # keep that core so inflected headlines match without dragging in noisy words like "proces".
        cores = [t for t in content_tokens(term) if not t.isdigit()]
        if len(cores) == 1 and len(cores[0]) >= 5 and cores[0] not in GENERIC_TERMS:
            add(cores[0])

    if not out:
        # Last resort: original user phrase (may be Chinese — then crawl will find nothing until AI expands well)
        add(phrase)

    return out


def clean_match_groups(raw: Any) -> list[list[str]]:
    """Normalize AI/DB match_groups into [[variant, …], …].

    Generic single words are kept: dropping them used to delete whole facets such as
    ["Srbija", "Serbia"], which both widened the match and pushed the facet count below
    the two needed to keep strict mode alive.
    """
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
            seen.add(key)
            cleaned.append(s[:80])
        if cleaned:
            groups.append(cleaned[:12])
    return groups[:6]


def clean_exclude_terms(raw: Any) -> list[str]:
    """Wrong-sense terms that veto a match (e.g. `premijera` for a `premijer` intent)."""
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        s = str(item).strip()
        key = normalize_for_match(s)
        if not key or key in seen or key.isdigit() or key in MATCH_STOPWORDS:
            continue
        seen.add(key)
        out.append(s[:80])
    return out[:12]


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


def score_facets(
    article: dict[str, Any],
    groups: list[list[str]],
    *,
    recall: bool = False,
) -> tuple[bool, float]:
    """Weighted facet coverage. Returns (matched, coverage).

    OR within a facet (language variants), weighted partial AND across facets. `recall`
    widens this into the stage-1 candidate net that the LLM pass then confirms.
    """
    groups = [g for g in groups if g]
    if not groups:
        return False, 0.0
    hay, normalized = haystack_for_article(article)
    weights = [facet_weight(g) for g in groups]
    hits = [any(phrase_hits(hay, normalized, alt) for alt in g) for g in groups]

    total = sum(weights)
    if total <= 0:
        return False, 0.0
    coverage = sum(w for w, h in zip(weights, hits) if h) / total

    misses = allowed_facet_misses(len(groups)) + (1 if recall else 0)
    need = max(1, len(groups) - misses)
    if sum(hits) < need:
        return False, coverage
    if coverage < (RECALL_MIN_COVERAGE if recall else MIN_COVERAGE):
        return False, coverage
    if not recall:
        # The single most specific facet is the intent's anchor; without it the rest is context.
        anchor = weights.index(max(weights))
        if not hits[anchor]:
            return False, coverage
    return True, coverage


def score_terms(article: dict[str, Any], terms: list[str]) -> bool:
    """OR across terms, but a bare generic word cannot carry the match by itself.

    A long intent that expanded into `["izbori u Srbiji", "Srbija"]` used to match every
    story mentioning Serbia. Generic terms are only consulted when the keyword has
    nothing more specific — i.e. the user really did subscribe to a whole beat.
    """
    terms = [t for t in terms if t and t.strip()]
    if not terms:
        return False
    hay, normalized = haystack_for_article(article)
    specific = [t for t in terms if term_weight(t) >= SELF_SUFFICIENT_WEIGHT]
    pool = specific or terms
    return any(phrase_hits(hay, normalized, term) for term in pool)


def article_excluded(article: dict[str, Any], row: dict[str, Any]) -> bool:
    """True when the article hits a wrong-sense term the expansion flagged."""
    excludes = clean_exclude_terms(row.get("exclude_terms"))
    if not excludes:
        return False
    hay, normalized = haystack_for_article(article)
    return any(phrase_hits(hay, normalized, term) for term in excludes)


def article_matches_keyword_row(
    article: dict[str, Any], row: dict[str, Any], *, recall: bool = False
) -> bool:
    """Match one user keyword using weighted facets or scored loose terms."""
    if article_excluded(article, row):
        return False
    mode = (row.get("match_mode") or "").strip() or suggest_match_mode(row.get("phrase") or "")
    groups = clean_match_groups(row.get("match_groups"))
    if groups and (mode == "strict" or len(groups) >= 2):
        matched, _ = score_facets(article, groups, recall=recall)
        return matched
    terms = expand_match_terms(row.get("phrase") or "", row.get("search_terms") or [])
    # If AI returned groups but mode loose, still allow OR of flattened variants
    if not terms and groups:
        terms = [alt for g in groups for alt in g]
    return score_terms(article, terms)


# Backward-compatible alias
def article_matches_groups(haystack: str, terms: list[str]) -> bool:
    if not terms:
        return False
    return any(matches_keyword(haystack, term) for term in terms)
