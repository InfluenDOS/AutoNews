/** Rail epigraph: a random seven-character couplet (七言). */

export type Poem = {
  /** Two seven-character lines. */
  lines: [string, string]
  author: string
  title: string
}

/** While a page stays open, show another couplet this often. */
export const POEM_ROTATE_MS = 30 * 60 * 1000

/** Shown only if the couplet file cannot be loaded. */
export const FALLBACK_POEM: Poem = {
  lines: ['溪云初起日沉阁', '山雨欲来风满楼'],
  author: '许浑',
  title: '咸阳城西楼晚眺',
}

const LAST_KEY = 'autonews-poem-last'

export type PoemFile = { source: string; commit: string; poems: [string, string, string, string][] }

let listPromise: Promise<Poem[]> | null = null

/**
 * public/poems/qiyan.json, built by scripts/build-poems.mjs. Fetched after first
 * paint and cached by the browser, so it never delays the page.
 */
export function loadPoems(): Promise<Poem[]> {
  if (!listPromise) {
    // Relative to index.html, which is the only page (HashRouter).
    listPromise = fetch('poems/qiyan.json')
      .then((resp) => {
        if (!resp.ok) throw new Error(`poems: HTTP ${resp.status}`)
        return resp.json() as Promise<PoemFile>
      })
      .then((file) => file.poems.map(toPoem))
      .catch((err: unknown) => {
        listPromise = null
        throw err
      })
  }
  return listPromise
}

export function toPoem([a, b, author, title]: [string, string, string, string]): Poem {
  return { lines: [a, b], author, title }
}

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

function writeLast(key: string) {
  try {
    localStorage.setItem(LAST_KEY, key)
  } catch {
    /* ignore */
  }
}

/** A random couplet, never the one this browser showed last. */
export function pickPoem(list: Poem[], previous: string | null = readLast()): Poem {
  if (list.length === 0) return FALLBACK_POEM
  let poem = list[Math.floor(Math.random() * list.length)]
  if (list.length > 1) {
    while (poem.lines[0] === previous) poem = list[Math.floor(Math.random() * list.length)]
  }
  writeLast(poem.lines[0])
  return poem
}
