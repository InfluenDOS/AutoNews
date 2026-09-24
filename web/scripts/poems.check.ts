import { readFileSync } from 'node:fs'
import OpenCC from 'opencc-js'
import { FALLBACK_POEM, pickPoem, toPoem, type PoemFile } from '../src/lib/poems.ts'

let failed = 0
function check(ok: boolean, label: string) {
  if (ok) console.log(`ok  ${label}`)
  else {
    failed += 1
    console.error(`FAIL ${label}`)
  }
}

const file = JSON.parse(
  readFileSync(new URL('../public/poems/qiyan.json', import.meta.url), 'utf8'),
) as PoemFile
const poems = file.poems.map(toPoem)

const HAN = /^\p{Script=Han}{7}$/u
const badLines = [...poems, FALLBACK_POEM].flatMap((p) =>
  p.lines.filter((line) => !HAN.test(line)).map((line) => `${line}（${p.author}）`),
)
check(badLines.length === 0, `every line is exactly seven Han characters${badLines.length ? `: ${badLines.join('、')}` : ''}`)

const keys = poems.map((p) => p.lines.join(''))
check(new Set(keys).size === keys.length, 'no duplicate couplets')
check(poems.every((p) => p.author && p.title), 'every couplet has an author and a title')
check(poems.length >= 800, `a large pool (${poems.length} couplets)`)
check(Boolean(file.source && /^[0-9a-f]{40}$/.test(file.commit)), 'source and pinned commit are recorded')

const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' })
const traditional = poems.filter((p) => toSimplified(p.lines.join('') + p.author + p.title) !== p.lines.join('') + p.author + p.title)
check(traditional.length === 0, `text is simplified Chinese${traditional.length ? `: ${traditional[0].lines.join('，')}` : ''}`)

const previous = poems[0].lines[0]
const picks = Array.from({ length: 200 }, () => pickPoem([poems[0], poems[1]], previous))
check(picks.every((p) => p.lines[0] !== previous), 'a new pick never repeats the previous couplet')
check(pickPoem([]) === FALLBACK_POEM, 'an empty list falls back')

if (failed) {
  console.error(`${failed} poem check(s) failed`)
  process.exit(1)
}
console.log('poem checks passed')
