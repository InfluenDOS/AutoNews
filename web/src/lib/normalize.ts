/** Serbian Latin <-> Cyrillic transliteration for keyword matching. */

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

export function matchesKeyword(haystack: string, keyword: string): boolean {
  const h = normalizeForMatch(haystack)
  const k = normalizeForMatch(keyword)
  if (!k) return false
  return h.includes(k)
}

export function articleMatchesKeywords(
  article: { title: string; summary: string; raw_text_normalized?: string },
  phrases: string[],
): boolean {
  if (phrases.length === 0) return true
  const combined = `${article.title} ${article.summary}`
  const normalized = article.raw_text_normalized || normalizeForMatch(combined)
  return phrases.some((phrase) => {
    const k = normalizeForMatch(phrase)
    return k && (matchesKeyword(combined, phrase) || normalized.includes(k))
  })
}

/** Terms too common in Serbian headlines to use alone for filtering. */
const MATCH_STOPWORDS = new Set(
  [
    'srbija',
    'serbia',
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
  ].map((s) => s.toLocaleLowerCase('sr')),
)

/** Prefer AI-expanded Serbian terms; fall back to the raw user phrase.
 * Also split multi-word phrases into tokens so matching is less brittle.
 */
export function keywordMatchTerms(keyword: {
  phrase: string
  search_terms?: string[] | null
}): string[] {
  const raw = (keyword.search_terms || []).map((t) => t.trim()).filter(Boolean)
  const base = raw.length > 0 ? raw : keyword.phrase.trim() ? [keyword.phrase.trim()] : []
  const out: string[] = []
  const seen = new Set<string>()
  for (const term of base) {
    const parts = [term, ...term.split(/[\s,/|]+/).filter((w) => w.length >= 4)]
    for (const p of parts) {
      const key = normalizeForMatch(p)
      if (!key || seen.has(key) || MATCH_STOPWORDS.has(key)) continue
      seen.add(key)
      out.push(p)
    }
  }
  // If everything was stopword-filtered, keep originals so something still matches
  if (out.length === 0) {
    for (const term of base) {
      const key = normalizeForMatch(term)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(term)
    }
  }
  return out
}
