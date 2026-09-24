// Build public/poems/qiyan.json: seven-character couplets (七言) for the rail.
//
// Source: chinese-poetry (MIT), 唐诗三百首 and 千家诗, pinned to one commit so the
// output is reproducible. Traditional text is converted with OpenCC (t → cn).
// Run: node scripts/build-poems.mjs
import { writeFile, mkdir } from 'node:fs/promises'
import OpenCC from 'opencc-js'

const COMMIT = 'b8594f81a89752241442f2ce267d6f66f96704ee'
const BASE = `https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/${COMMIT}/`
const SOURCES = ['蒙学/tangshisanbaishou.json', '蒙学/qianjiashi.json']
const OUT = new URL('../public/poems/qiyan.json', import.meta.url)

// Standard traditional → mainland simplified; keeps 著 in 寒梅著花未.
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' })

// A whole sentence made of two seven-character lines.
const COUPLET = /^(\p{Script=Han}{7})，(\p{Script=Han}{7})[。！？；]$/u

function* poemsOf(book) {
  for (const section of book.content ?? []) {
    for (const poem of section.content ?? []) yield poem
  }
}

function cleanAuthor(raw) {
  // 千家诗 writes authors as "（唐）孟浩然".
  return String(raw ?? '').replace(/^[（(][^）)]*[）)]/, '').trim()
}

// 千家诗 keeps a few attributions that modern editions correct. Only widely
// documented cases are listed; everything else is taken as the source has it.
const CORRECTIONS = {
  '苏轼|西湖': ['杨万里', '晓出净慈寺送林子方'],
  '司马光|有约': ['赵师秀', '约客'],
  '范成大|村居即事': ['翁卷', '乡村四月'],
  '僧志安|绝句': ['僧志南', '绝句'],
}

const couplets = []
const seen = new Set()
for (const path of SOURCES) {
  const resp = await fetch(BASE + encodeURI(path))
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`)
  const book = await resp.json()
  for (const poem of poemsOf(book)) {
    let author = toSimplified(cleanAuthor(poem.author))
    let title = toSimplified(String(poem.chapter ?? '').trim())
    if (!author || !title) continue
    const fix = CORRECTIONS[`${author}|${title}`]
    if (fix) [author, title] = fix
    const text = toSimplified((poem.paragraphs ?? []).join(''))
    for (const sentence of text.split(/(?<=[。！？；])/u)) {
      const m = sentence.trim().match(COUPLET)
      if (!m) continue
      const key = m[1] + m[2]
      if (seen.has(key)) continue
      seen.add(key)
      couplets.push([m[1], m[2], author, title])
    }
  }
}

await mkdir(new URL('.', OUT), { recursive: true })
await writeFile(
  OUT,
  JSON.stringify({
    source: 'chinese-poetry (MIT) · 唐诗三百首 / 千家诗',
    commit: COMMIT,
    poems: couplets,
  }),
)
console.log(`wrote ${couplets.length} couplets to public/poems/qiyan.json`)
