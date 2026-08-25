/** Serbian Latin <-> Cyrillic + strict keyword matching (no broad single-token false hits). */

const LATIN_TO_CYRILLIC: [string, string][] = [
  ['dž', 'џ'],
  ['Dž', 'Џ'],
  ['DŽ', 'Џ'],
  ['lj', 'љ'],
  ['Lj', 'Љ'],
  ['LJ', 'Љ'],
  ['nj', 'њ'],
  ['Nj', 'Њ'],
  ['NJ', 'Њ'],
  ['a', 'а'],
  ['A', 'А'],
  ['b', 'б'],
  ['B', 'Б'],
  ['v', 'в'],
  ['V', 'В'],
  ['g', 'г'],
  ['G', 'Г'],
  ['d', 'д'],
  ['D', 'Д'],
  ['đ', 'ђ'],
  ['Đ', 'Ђ'],
  ['e', 'е'],
  ['E', 'Е'],
  ['ž', 'ж'],
  ['Ž', 'Ж'],
  ['z', 'з'],
  ['Z', 'З'],
  ['i', 'и'],
  ['I', 'И'],
  ['j', 'ј'],
  ['J', 'Ј'],
  ['k', 'к'],
  ['K', 'К'],
  ['l', 'л'],
  ['L', 'Л'],
  ['m', 'м'],
  ['M', 'М'],
  ['n', 'н'],
  ['N', 'Н'],
  ['o', 'о'],
  ['O', 'О'],
  ['p', 'п'],
  ['P', 'П'],
  ['r', 'р'],
  ['R', 'Р'],
  ['s', 'с'],
  ['S', 'С'],
  ['t', 'т'],
  ['T', 'Т'],
  ['ć', 'ћ'],
  ['Ć', 'Ћ'],
  ['u', 'у'],
  ['U', 'У'],
  ['f', 'ф'],
  ['F', 'Ф'],
  ['h', 'х'],
  ['H', 'Х'],
  ['c', 'ц'],
  ['C', 'Ц'],
  ['č', 'ч'],
  ['Č', 'Ч'],
  ['š', 'ш'],
  ['Š', 'Ш'],
]

const CYRILLIC_TO_LATIN: [string, string][] = [
  ['џ', 'dž'],
  ['Џ', 'Dž'],
  ['љ', 'lj'],
  ['Љ', 'Lj'],
  ['њ', 'nj'],
  ['Њ', 'Nj'],
  ['а', 'a'],
  ['А', 'A'],
  ['б', 'b'],
  ['Б', 'B'],
  ['в', 'v'],
  ['В', 'V'],
  ['г', 'g'],
  ['Г', 'G'],
  ['д', 'd'],
  ['Д', 'D'],
  ['ђ', 'đ'],
  ['Ђ', 'Đ'],
  ['е', 'e'],
  ['Е', 'E'],
  ['ж', 'ž'],
  ['Ж', 'Ž'],
  ['з', 'z'],
  ['З', 'Z'],
  ['и', 'i'],
  ['И', 'I'],
  ['ј', 'j'],
  ['Ј', 'J'],
  ['к', 'k'],
  ['К', 'K'],
  ['л', 'l'],
  ['Л', 'L'],
  ['м', 'm'],
  ['М', 'M'],
  ['н', 'n'],
  ['Н', 'N'],
  ['о', 'o'],
  ['О', 'O'],
  ['п', 'p'],
  ['П', 'P'],
  ['р', 'r'],
  ['Р', 'R'],
  ['с', 's'],
  ['С', 'S'],
  ['т', 't'],
  ['Т', 'T'],
  ['ћ', 'ć'],
  ['Ћ', 'Ć'],
  ['у', 'u'],
  ['У', 'U'],
  ['ф', 'f'],
  ['Ф', 'F'],
  ['х', 'h'],
  ['Х', 'H'],
  ['ц', 'c'],
  ['Ц', 'C'],
  ['ч', 'č'],
  ['Ч', 'Č'],
  ['ш', 'š'],
  ['Ш', 'Š'],
]

function applyMap(text: string, mapping: [string, string][]): string {
  let result = text
  for (const [src, dst] of mapping) {
    result = result.split(src).join(dst)
  }
  return result
}

export function toLatin(text: string): string {
  return applyMap(text, CYRILLIC_TO_LATIN)
}

export function toCyrillic(text: string): string {
  return applyMap(text, LATIN_TO_CYRILLIC)
}

export function normalizeForMatch(text: string): string {
  if (!text) return ''
  return toLatin(text).toLocaleLowerCase('sr').trim()
}

function isWordChar(ch: string): boolean {
  return /\p{L}|\p{N}/u.test(ch)
}

const SR_SUFFIXES = [
  'ijima',
  'ijama',
  'ovima',
  'evima',
  'ijem',
  'ijom',
  'ima',
  'ama',
  'oga',
  'ome',
  'omu',
  'ski',
  'ska',
  'sko',
  'cki',
  'cka',
  'cko',
  'ški',
  'ška',
  'ško',
  'ovi',
  'evi',
  'om',
  'em',
  'im',
  'og',
  'oj',
  'ih',
  'na',
  'ni',
  'ne',
  'no',
  'a',
  'e',
  'i',
  'u',
  'o',
] as const

/**
 * Query token → exact haystack forms that must NOT count as a hit (false friends).
 * Matched exactly: `izbori` must still reach `izborni` (electoral), just not `izbor` (a choice).
 *
 * Only unambiguous wrong-sense forms belong here. `izbora` and `izboru` are left out on
 * purpose: they are the ordinary way to write "of/at the elections" (datum izbora), so
 * blocking them would cost more than the occasional "depending on your selection". Cases
 * that need real context are handled by the AI's exclude_terms and the stage-2 pass.
 */
const FALSE_FRIEND_HITS: Record<string, ReadonlySet<string>> = {
  // premijer = prime minister; premijera = film premiere
  premijer: new Set(['premijera']),
  premijerka: new Set(['premijera']),
  // izbor = "choice/selection"; izbori / izbore / izborni = "elections"
  izbori: new Set(['izbor']),
  izbore: new Set(['izbor']),
  izborima: new Set(['izbor']),
  izborite: new Set(['izbor']),
}

const MIN_STEM = 4

function lightStem(word: string): string {
  const w = normalizeForMatch(word)
  if (w.length < 5) return w
  for (const suf of SR_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= MIN_STEM) return w.slice(0, -suf.length)
  }
  return w
}

/**
 * Word plus every form obtained by stripping ONE known inflectional ending.
 * Two words are the same lemma when their candidate sets overlap. Unlike prefix
 * matching this refuses `vlada`→`Vladimir` / `kineski`→`kinematografija`.
 */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

/** Serbian «nepostojano a»: migranat → migrant, sastanak → sastank. */
function dropFugitiveA(form: string): string | null {
  if (form.length < 5) return null
  if (VOWELS.has(form.slice(-1)) || form.slice(-2, -1) !== 'a' || VOWELS.has(form.slice(-3, -2))) {
    return null
  }
  return form.slice(0, -2) + form.slice(-1)
}

function stemCandidates(word: string): Set<string> {
  const w = normalizeForMatch(word)
  const out = new Set<string>()
  if (!w) return out
  out.add(w)
  if (w.length < 5) return out
  for (const suf of SR_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= MIN_STEM) out.add(w.slice(0, -suf.length))
  }
  for (const form of [...out]) {
    const collapsed = dropFugitiveA(form)
    if (collapsed && collapsed.length >= MIN_STEM) out.add(collapsed)
  }
  return out
}

function longEnough(forms: Set<string>): string[] {
  return [...forms].filter((f) => f.length >= MIN_STEM)
}

function haystackWords(haystack: string): string[] {
  const h = normalizeForMatch(haystack)
  const out: string[] = []
  let buf = ''
  for (const ch of h) {
    if (isWordChar(ch)) buf += ch
    else if (buf) {
      out.push(buf)
      buf = ''
    }
  }
  if (buf) out.push(buf)
  return out
}

function isFalseFriend(queryToken: string, hayWord: string): boolean {
  const q = normalizeForMatch(queryToken)
  const blocked = FALSE_FRIEND_HITS[q] || FALSE_FRIEND_HITS[lightStem(q)]
  return blocked ? blocked.has(normalizeForMatch(hayWord)) : false
}

function matchesKeywordExact(haystack: string, keyword: string): boolean {
  const h = normalizeForMatch(haystack)
  const k = normalizeForMatch(keyword)
  if (!k) return false
  let start = 0
  while (true) {
    const i = h.indexOf(k, start)
    if (i < 0) return false
    const beforeOk = i === 0 || !isWordChar(h[i - 1]!)
    const after = i + k.length
    const afterOk = after >= h.length || !isWordChar(h[after]!)
    if (beforeOk && afterOk) return true
    start = i + 1
  }
}

function matchesToken(haystack: string, token: string): boolean {
  const t = normalizeForMatch(token)
  if (!t) return false
  if (matchesKeywordExact(haystack, t)) return true
  const tokenForms = longEnough(stemCandidates(t))
  if (tokenForms.length === 0) return false
  for (const word of haystackWords(haystack)) {
    if (isFalseFriend(t, word)) continue
    if (word === t) return true
    const wordForms = stemCandidates(word)
    if (tokenForms.some((f) => wordForms.has(f))) return true
  }
  return false
}

const MATCH_STOPWORDS = new Set([
  // Function words only — place names must stay in multi-word AND matching
  'vesti',
  'news',
  'world',
  'svet',
  'u',
  'i',
  'na',
  'od',
  'za',
  'sa',
  'se',
  'je',
  'su',
  'a',
  'the',
  'of',
  'and',
])

function contentTokens(term: string): string[] {
  return normalizeForMatch(term)
    .split(/\s+/)
    .filter((p) => p && !MATCH_STOPWORDS.has(p))
}

/**
 * A domestic newsroom does not repeat its own country: an AI term like "izbori u Srbiji"
 * has to match the headline "prvo su tražili izbore".
 */
const IMPLIED_LOCATION_STEMS = [
  'srbij',
  'srpsk',
  'serbia',
  'serbian',
  'balkan',
  'beograd',
  'belgrad',
]

/** …but only when the story is not about somewhere else instead. */
const OTHER_COUNTRIES = [
  'Hrvatska',
  'Croatia',
  'Bosna',
  'Bosnia',
  'Hercegovina',
  'Crna Gora',
  'Montenegro',
  'Makedonija',
  'Macedonia',
  'Slovenija',
  'Slovenia',
  'Kosovo',
  'Albanija',
  'Albania',
  'Bugarska',
  'Bulgaria',
  'Rumunija',
  'Romania',
  'Mađarska',
  'Madjarska',
  'Hungary',
  'Grčka',
  'Greece',
  'Turska',
  'Turkey',
  'Rusija',
  'Russia',
  'Ukrajina',
  'Ukraine',
  'Nemačka',
  'Germany',
  'Francuska',
  'France',
  'Italija',
  'Italy',
  'Austrija',
  'Austria',
  'Poljska',
  'Poland',
]

function isImpliedLocation(token: string): boolean {
  const t = normalizeForMatch(token)
  return IMPLIED_LOCATION_STEMS.some((stem) => t.startsWith(stem))
}

/** True if the text names a country the search term did not ask for. */
function mentionsOtherCountry(haystack: string, allowedTokens: string[]): boolean {
  const allowed = new Set(allowedTokens.map(normalizeForMatch))
  return OTHER_COUNTRIES.some((country) => {
    const toks = contentTokens(country)
    if (toks.length === 0 || toks.some((t) => allowed.has(t))) return false
    return (
      matchesKeywordExact(haystack, country) || toks.every((t) => matchesToken(haystack, t))
    )
  })
}

/**
 * Inflection-aware match. Multi-word terms need every content token, except that a
 * local-location token may be implied when the story names no other country.
 */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  const k = normalizeForMatch(keyword)
  if (!k) return false
  if (matchesKeywordExact(haystack, k)) return true
  const toks = contentTokens(k).filter((t) => !/^\d+$/.test(t))
  if (toks.length === 0) return false
  const missing = toks.filter((t) => !matchesToken(haystack, t))
  if (missing.length === 0) return true
  if (!missing.every(isImpliedLocation)) return false
  // Implying the country is only safe when something distinctive did match: `vlada` alone
  // would otherwise pull in the given name Vlado, `premijer` alone any prime minister.
  const present = toks.filter((t) => !missing.includes(t))
  if (!present.some((t) => !GENERIC_TERMS.has(t))) return false
  return !mentionsOtherCountry(haystack, toks)
}

export function articleMatchesKeywords(
  article: { title: string; summary: string; raw_text_normalized?: string },
  phrases: string[],
): boolean {
  if (phrases.length === 0) return false
  const combined = `${article.title} ${article.summary}`
  const normalized = article.raw_text_normalized || normalizeForMatch(combined)
  return phrases.some(
    (phrase) => matchesKeyword(combined, phrase) || matchesKeyword(normalized, phrase),
  )
}

/**
 * Generic on their own: they describe a whole beat, not a story. Kept as search terms
 * but weighted down, so they can narrow a match without carrying one.
 */
const GENERIC_TERMS = new Set([
  'kina',
  'kineski',
  'kineska',
  'kinesko',
  'chinese',
  'china',
  'migranti',
  'migrant',
  'imigranti',
  'imigrant',
  'ilegalni',
  'ilegalno',
  'illegal',
  'investicije',
  'politika',
  'ekonomija',
  'diplomatija',
  'trgovina',
  'tehnologija',
  'vojska',
  'kultura',
  'sport',
  // Political titles alone are noisy; premijer ⊂ premijera (film premiere)
  'premijer',
  'premijerka',
  'premijera',
  'predsednik',
  'predsednica',
  'vlade',
  'vlada',
  // Places — ok inside phrases, too broad alone
  'srbija',
  'serbia',
  'srbiji',
  'srbiju',
  'srbijom',
  'balkan',
  'beograd',
  'belgrade',
  'evropa',
  'europa',
  'europe',
  // Climate alone matches any "Season 3" trailer
  'climate',
  'weather',
  'season',
  'seasons',
  'temperature',
  'precipitation',
])

const WEIGHT_PHRASE = 1.0
const WEIGHT_DISTINCTIVE = 0.8
const WEIGHT_SHORT = 0.5
const WEIGHT_GENERIC = 0.3

/** A term at or above this weight is specific enough to justify a hit on its own. */
const SELF_SUFFICIENT_WEIGHT = WEIGHT_SHORT
/** Share of total facet weight an article must cover. */
const MIN_COVERAGE = 0.6

/** How much evidence one search term carries. Phrases beat bare generic words. */
export function termWeight(term: string): number {
  const toks = contentTokens(term).filter((t) => !/^\d+$/.test(t))
  if (toks.length === 0) return 0
  if (toks.length >= 2) return WEIGHT_PHRASE
  const tok = toks[0]!
  if (GENERIC_TERMS.has(tok)) return WEIGHT_GENERIC
  if (tok.length >= 5) return WEIGHT_DISTINCTIVE
  return WEIGHT_SHORT
}

/** A facet is as specific as its most specific language variant. */
function facetWeight(group: string[]): number {
  return group.reduce((max, alt) => Math.max(max, termWeight(alt)), 0)
}

/**
 * How many facets an article may leave implicit. AI over-decomposes long intents and
 * newsrooms imply context instead of spelling it out, so full AND across every facet
 * rejects obviously on-topic stories. Two facets stay mandatory because there is
 * nothing left to corroborate a single hit.
 */
function allowedFacetMisses(count: number): number {
  if (count <= 2) return 0
  if (count <= 4) return 1
  return 2
}

/** Prefer AI phrases; also keep distinctive content cores for inflection matching. */
export function keywordMatchTerms(keyword: {
  phrase: string
  search_terms?: string[] | null
}): string[] {
  const raw = (keyword.search_terms || []).map((t) => t.trim()).filter(Boolean)
  const base = raw.length > 0 ? raw : keyword.phrase.trim() ? [keyword.phrase.trim()] : []
  const out: string[] = []
  const seen = new Set<string>()

  const add = (term: string) => {
    const key = normalizeForMatch(term)
    if (!key || seen.has(key) || MATCH_STOPWORDS.has(key) || /^\d+$/.test(key)) return
    seen.add(key)
    out.push(term)
  }

  for (const term of base) {
    add(term)
    const cores = contentTokens(term).filter((t) => !/^\d+$/.test(t))
    if (cores.length === 1 && cores[0]!.length >= 5 && !GENERIC_TERMS.has(cores[0]!)) {
      add(cores[0]!)
    }
  }

  if (out.length === 0 && keyword.phrase.trim()) {
    out.push(keyword.phrase.trim())
  }
  return out
}

/**
 * Generic single words are kept: dropping them used to delete whole facets such as
 * ["Srbija", "Serbia"], which both widened the match and pushed the facet count below
 * the two needed to keep strict mode alive.
 */
function cleanMatchGroups(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return []
  const groups: string[][] = []
  for (const g of raw) {
    if (!Array.isArray(g)) continue
    const cleaned: string[] = []
    const seen = new Set<string>()
    for (const item of g) {
      const s = String(item || '').trim()
      if (!s) continue
      const key = normalizeForMatch(s)
      if (!key || seen.has(key) || MATCH_STOPWORDS.has(key) || /^\d+$/.test(key)) continue
      seen.add(key)
      cleaned.push(s)
    }
    if (cleaned.length) groups.push(cleaned)
  }
  return groups
}

function cleanExcludeTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const s = String(item || '').trim()
    const key = normalizeForMatch(s)
    if (!key || seen.has(key) || MATCH_STOPWORDS.has(key) || /^\d+$/.test(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

export function suggestMatchMode(phrase: string): 'loose' | 'strict' {
  const p = phrase.trim()
  const cjk = [...p].filter((ch) => ch >= '\u4e00' && ch <= '\u9fff').length
  if (cjk >= 8 || p.length >= 24) return 'strict'
  return 'loose'
}

type MatchArticle = {
  id?: string
  title: string
  summary: string
  raw_text_normalized?: string
}

/**
 * Weighted facet coverage: OR within a facet (language variants), weighted partial AND
 * across facets. The most specific facet is the intent's anchor and stays mandatory.
 */
function articleCoversFacets(article: MatchArticle, groups: string[][]): boolean {
  const facets = groups.filter((g) => g.length > 0)
  if (facets.length === 0) return false
  const weights = facets.map(facetWeight)
  const hits = facets.map((group) => articleMatchesKeywords(article, group))

  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return false
  const covered = weights.reduce((sum, w, i) => (hits[i] ? sum + w : sum), 0)
  if (covered / total < MIN_COVERAGE) return false

  const need = Math.max(1, facets.length - allowedFacetMisses(facets.length))
  if (hits.filter(Boolean).length < need) return false

  const anchor = weights.indexOf(Math.max(...weights))
  return hits[anchor] === true
}

/**
 * OR across terms, but a bare generic word cannot carry the match by itself. A long
 * intent that expanded into `["izbori u Srbiji", "Srbija"]` used to match every story
 * mentioning Serbia. Generic terms are only consulted when the keyword has nothing more
 * specific — i.e. the user really did subscribe to a whole beat.
 */
function articleMatchesScoredTerms(article: MatchArticle, terms: string[]): boolean {
  if (terms.length === 0) return false
  const specific = terms.filter((t) => termWeight(t) >= SELF_SUFFICIENT_WEIGHT)
  return articleMatchesKeywords(article, specific.length > 0 ? specific : terms)
}

/**
 * Match one keyword.
 *
 * A stored verdict always wins: the crawler produced it by having the model read the
 * full article body against the user's intent, and the client only ever holds the title
 * and RSS summary, so re-deriving the answer here can only be worse. Rules run when no
 * verdict exists — a keyword edited since the last crawl, or a crawl that ran out of
 * scoring budget and fell back to rules itself.
 */
export function articleMatchesKeyword(
  article: MatchArticle,
  keyword: {
    id?: string
    phrase: string
    search_terms?: string[] | null
    match_groups?: string[][] | null
    match_mode?: string | null
    exclude_terms?: string[] | null
  },
  relevance?: Map<string, boolean>,
): boolean {
  if (relevance && keyword.id && article.id) {
    const verdict = relevance.get(`${keyword.id}:${article.id}`)
    if (verdict !== undefined) return verdict
  }

  const excludes = cleanExcludeTerms(keyword.exclude_terms)
  if (excludes.length > 0 && articleMatchesKeywords(article, excludes)) return false

  const mode =
    keyword.match_mode === 'strict' || keyword.match_mode === 'loose'
      ? keyword.match_mode
      : suggestMatchMode(keyword.phrase)
  const groups = cleanMatchGroups(keyword.match_groups)

  if (groups.length > 0 && (mode === 'strict' || groups.length >= 2)) {
    return articleCoversFacets(article, groups)
  }
  return articleMatchesScoredTerms(article, keywordMatchTerms(keyword))
}
