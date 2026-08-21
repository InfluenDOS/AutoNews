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

const FALSE_FRIEND_HITS: Record<string, ReadonlySet<string>> = {
  premijer: new Set(['premijera']),
  premijerka: new Set(['premijera']),
  // izbor = "choice/selection"; izbori / izbore / … = "elections"
  izbori: new Set(['izbor']),
  izbore: new Set(['izbor']),
  izborima: new Set(['izbor']),
  izborite: new Set(['izbor']),
}

function lightStem(word: string): string {
  const w = normalizeForMatch(word)
  if (w.length < 5) return w
  for (const suf of SR_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length)
  }
  return w
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
  const w = normalizeForMatch(hayWord)
  const blocked = FALSE_FRIEND_HITS[q] || FALSE_FRIEND_HITS[lightStem(q)]
  if (!blocked) return false
  return blocked.has(w) || [...blocked].some((b) => w.startsWith(b) && w !== q)
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
  const stem = lightStem(t)
  if (stem.length < 4) return false
  for (const word of haystackWords(haystack)) {
    if (isFalseFriend(t, word)) continue
    if (word === t) return true
    const wStem = lightStem(word)
    if (wStem === stem) return true
    if (stem.length >= 4 && (word.startsWith(stem) || (stem.startsWith(wStem) && wStem.length >= 4))) {
      if (isFalseFriend(t, word)) continue
      return true
    }
  }
  return false
}

const MATCH_STOPWORDS = new Set([
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

/** Inflection-aware match; multi-word uses content-token AND after dropping stopwords. */
export function matchesKeyword(haystack: string, keyword: string): boolean {
  const k = normalizeForMatch(keyword)
  if (!k) return false
  if (matchesKeywordExact(haystack, k)) return true
  let toks = contentTokens(k).filter((t) => !/^\d+$/.test(t))
  if (toks.length === 0) return false
  return toks.every((t) => matchesToken(haystack, t))
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

const BROAD_SINGLE_TERMS = new Set([
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
])

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
    if (!term.includes(' ') && BROAD_SINGLE_TERMS.has(key)) return
    seen.add(key)
    out.push(term)
  }

  for (const term of base) {
    add(term)
    const cores = contentTokens(term).filter((t) => !/^\d+$/.test(t))
    if (cores.length === 1 && cores[0]!.length >= 5 && !BROAD_SINGLE_TERMS.has(cores[0]!)) {
      add(cores[0]!)
    }
  }

  if (out.length === 0 && keyword.phrase.trim()) {
    out.push(keyword.phrase.trim())
  }
  return out
}

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
      if (!s.includes(' ') && BROAD_SINGLE_TERMS.has(key)) continue
      seen.add(key)
      cleaned.push(s)
    }
    if (cleaned.length) groups.push(cleaned)
  }
  return groups
}

export function suggestMatchMode(phrase: string): 'loose' | 'strict' {
  const p = phrase.trim()
  const cjk = [...p].filter((ch) => ch >= '\u4e00' && ch <= '\u9fff').length
  if (cjk >= 8 || p.length >= 24) return 'strict'
  return 'loose'
}

/** Multi-facet / strict keywords use stage-2 relevance when available. */
export function keywordNeedsRelevance(
  keyword: {
    match_groups?: string[][] | null
    match_mode?: string | null
  },
): boolean {
  const groups = cleanMatchGroups(keyword.match_groups)
  if (groups.length >= 2) return true
  return keyword.match_mode === 'strict' && groups.length >= 2
}

/**
 * Match one keyword. Multi-facet keywords require a cached stage-2 `relevant=true`
 * when the map is provided; otherwise use rule recall for loose topics.
 */
export function articleMatchesKeyword(
  article: {
    id?: string
    title: string
    summary: string
    raw_text_normalized?: string
  },
  keyword: {
    id?: string
    phrase: string
    search_terms?: string[] | null
    match_groups?: string[][] | null
    match_mode?: string | null
  },
  relevance?: Map<string, boolean>,
): boolean {
  const needsRerank = keywordNeedsRelevance(keyword)

  if (needsRerank && relevance && keyword.id && article.id) {
    const key = `${keyword.id}:${article.id}`
    if (relevance.has(key)) return relevance.get(key) === true
    // No score yet for this pair — do not attribute another keyword's hit here
    return false
  }

  const mode =
    keyword.match_mode === 'strict' || keyword.match_mode === 'loose'
      ? keyword.match_mode
      : suggestMatchMode(keyword.phrase)
  const groups = cleanMatchGroups(keyword.match_groups)

  // Without relevance table loaded: soft half-group recall (align crawler stage-1)
  if ((mode === 'strict' || groups.length >= 2) && groups.length >= 2) {
    const hits = groups.filter((group) => articleMatchesKeywords(article, group)).length
    const need = Math.max(1, Math.ceil(groups.length / 2))
    return hits >= need
  }
  return articleMatchesKeywords(article, keywordMatchTerms(keyword))
}
