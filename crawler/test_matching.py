"""Matching regression checks: run with `python test_matching.py` (no pytest needed)."""

from __future__ import annotations

import sys

from normalize import (
    article_matches_keyword_row,
    clean_match_groups,
    matches_token,
    recall_score,
    term_weight,
)

failures: list[str] = []


def check(label: str, got: object, want: object) -> None:
    if got != want:
        failures.append(f"{label}: got {got!r}, want {want!r}")


def art(title: str, summary: str = "") -> dict[str, str]:
    return {"title": title, "summary": summary}


# --- Inflection matching must not leak into unrelated lemmas -------------------

SENSE_CASES = [
    # (query token, headline, should match)
    ("vlada", "Vladimir Putin u Moskvi", False),
    ("vlade", "Vladimir Putin dolazi", False),
    ("vlada", "Vlade Srbije donela odluku", True),
    ("vlada", "Sednica vladi u Beogradu", True),
    ("kineski", "Kinematografija u Beogradu", False),
    ("kineski", "Kineskih investitora sve više", True),
    ("kineski", "Kineska kompanija otvara fabriku", True),
    ("srbija", "Srbijagas potpisao ugovor", False),
    ("srbija", "U Srbiji pada kiša", True),
    ("izbori", "Izborni proces počinje", True),
    ("izbori", "Izbor najboljeg glumca", False),
    ("premijer", "Premijera filma u Beogradu", False),
    ("premijer", "Premijeru Srbije uručena nagrada", True),
]

for token, headline, want in SENSE_CASES:
    check(f"matches_token({token!r}, {headline!r})", matches_token(headline, token), want)


# --- Term weighting -----------------------------------------------------------

check("term_weight('Srbija')", term_weight("Srbija"), 0.3)
check("term_weight('izbori u Srbiji')", term_weight("izbori u Srbiji"), 1.0)
check("term_weight('izbori')", term_weight("izbori"), 0.8)
check("term_weight('rat')", term_weight("rat"), 0.5)


# --- Facets are no longer silently deleted ------------------------------------

check(
    "clean_match_groups keeps a generic-only facet",
    clean_match_groups([["Srbija", "Serbia"], ["izbori", "izbore"]]),
    [["Srbija", "Serbia"], ["izbori", "izbore"]],
)


# --- Symptom 1a: a long intent must not need every facet ----------------------

LONG_INTENT = {
    "phrase": "中国籍非法移民在塞尔维亚被拘留的情况",
    "match_mode": "strict",
    "match_groups": [
        ["kineski državljani", "kineskih državljana", "Chinese nationals"],
        ["ilegalni migranti", "ilegalne migracije", "illegal migrants"],
        ["Srbija", "Srbiji", "Serbia"],
        ["pritvor", "detention"],
    ],
    "search_terms": [],
}

check(
    "3 of 4 facets present → match",
    article_matches_keyword_row(
        art(
            "Kineski državljani bez dokumenata pronađeni u Srbiji",
            "Policija je otkrila grupu ilegalnih migranata na jugu zemlje.",
        ),
        LONG_INTENT,
    ),
    True,
)
check(
    "only the generic location facet → no match",
    article_matches_keyword_row(art("U Srbiji otvoren novi bazen"), LONG_INTENT),
    False,
)
check(
    "anchor facet missing → no match",
    article_matches_keyword_row(
        art("Ilegalni migranti u Srbiji", "Grupa migranata iz Sirije u pritvoru."),
        LONG_INTENT,
    ),
    False,
)


# --- Symptom 1b: a stray generic term must not widen a long intent ------------

LOOSE_WITH_GENERIC = {
    "phrase": "塞尔维亚大选",
    "match_mode": "loose",
    "match_groups": [],
    "search_terms": ["izbori u Srbiji", "parlamentarni izbori", "Srbija", "Serbia"],
}

check(
    "generic 'Srbija' alone no longer matches",
    article_matches_keyword_row(art("U Srbiji otvoren novi bazen"), LOOSE_WITH_GENERIC),
    False,
)
check(
    "specific term still matches",
    article_matches_keyword_row(
        art("Parlamentarni izbori zakazani za decembar"), LOOSE_WITH_GENERIC
    ),
    True,
)

# A genuinely broad subscription keeps working: nothing more specific exists.
BROAD_BEAT = {
    "phrase": "塞尔维亚",
    "match_mode": "loose",
    "match_groups": [],
    "search_terms": ["Srbija", "Srbiji", "Serbia"],
}
check(
    "beat subscription still matches",
    article_matches_keyword_row(art("U Srbiji otvoren novi bazen"), BROAD_BEAT),
    True,
)


# --- Symptom 2: wrong-sense veto ---------------------------------------------

PM_INTENT = {
    "phrase": "塞尔维亚总理",
    "match_mode": "loose",
    "match_groups": [],
    "search_terms": ["premijer Srbije", "predsednica vlade"],
    "exclude_terms": ["premijera filma", "filmska premijera"],
}
check(
    "wrong sense vetoed",
    article_matches_keyword_row(
        art("Premijer Srbije na premijeri filma", "Filmska premijera u Beogradu."),
        PM_INTENT,
    ),
    False,
)
check(
    "right sense kept",
    article_matches_keyword_row(art("Premijer Srbije primio delegaciju"), PM_INTENT),
    True,
)


# --- Two facets stay mandatory ------------------------------------------------

TWO_FACETS = {
    "phrase": "中国在塞尔维亚的投资",
    "match_mode": "strict",
    "match_groups": [
        ["kineske investicije", "kineski investitori", "Chinese investment"],
        ["Srbija", "Srbiji", "Serbia"],
    ],
    "search_terms": [],
}
check(
    "both facets present → match",
    article_matches_keyword_row(
        art("Kineske investicije u Srbiji dostigle rekord"), TWO_FACETS
    ),
    True,
)
check(
    "one of two facets → no match",
    article_matches_keyword_row(art("Kineske investicije u Mađarskoj"), TWO_FACETS),
    False,
)
check(
    "recall pass widens to one facet",
    article_matches_keyword_row(
        art("Kineske investicije u Mađarskoj"), TWO_FACETS, recall=True
    ),
    True,
)


# --- Recall shortlist: generous on purpose, and body-aware ---------------------

CHINA_SERBIA = {
    "phrase": "中国在塞尔维亚的投资",
    "match_groups": [["kineski", "kineska", "Kina"], ["Srbija", "Srbiji"]],
    "match_mode": "strict",
}

check(
    "recall counts every term that appears",
    recall_score(art("Kineske investicije u Srbiji dostigle rekord"), CHINA_SERBIA),
    2,
)
check(
    "recall shortlists on a single term the strict rule would reject",
    recall_score(art("Kineske investicije u Mađarskoj"), CHINA_SERBIA) > 0,
    True,
)
check(
    "recall stays out when nothing appears",
    recall_score(art("Poplave u Novom Sadu"), CHINA_SERBIA),
    0,
)

# The body is where terms usually live: an RSS summary is one truncated sentence.
BODY_ONLY = {
    "title": "Potpisan sporazum o saradnji",
    "summary": "Sporazum je potpisan u ponedeljak.",
    "body": "U Pekingu je potpisan sporazum između kineske kompanije i Vlade Srbije.",
}
check(
    "title and summary alone miss the terms",
    recall_score(
        {k: v for k, v in BODY_ONLY.items() if k != "body"}, CHINA_SERBIA
    ),
    0,
)
check(
    "body brings both facets into recall",
    recall_score(BODY_ONLY, CHINA_SERBIA),
    2,
)
check(
    "body lets the strict rule match too",
    article_matches_keyword_row(BODY_ONLY, CHINA_SERBIA),
    True,
)


if failures:
    print(f"FAILED ({len(failures)}):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("all matching checks passed")
