"""Debug keyword matching."""
import sys
sys.stdout.reconfigure(encoding="utf-8")
from crawl import get_supabase, load_match_terms, article_matches
from normalize import expand_match_terms, normalize_for_match

sb = get_supabase()
kws = sb.table("keywords").select("*").execute().data or []
arts = sb.table("articles").select("*").execute().data or []
print("keywords", len(kws), "articles", len(arts))
for k in kws:
    print("KW:", k["phrase"])
    print(" terms:", k.get("search_terms"))
    print(" expand:", expand_match_terms(k["phrase"], k.get("search_terms") or []))

terms = load_match_terms(sb)
for a in arts:
    ok = article_matches(a, terms)
    # find why
    hits = []
    text = a.get("raw_text_normalized") or ""
    for t in terms:
        key = normalize_for_match(t)
        if key and key in text:
            # show context
            i = text.find(key)
            hits.append((t, text[max(0, i - 12) : i + len(key) + 12]))
    print(("MATCH" if ok else "MISS"), (a.get("title_zh") or a.get("title") or "")[:60], hits[:3])
