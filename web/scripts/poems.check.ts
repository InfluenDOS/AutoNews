import { POEMS, POEM_SLOT_MS, msUntilNextSlot, poemForSlot, poemSlot } from '../src/lib/poems.ts'

let failed = 0
function check(ok: boolean, label: string) {
  if (ok) console.log(`ok  ${label}`)
  else {
    failed += 1
    console.error(`FAIL ${label}`)
  }
}

const HAN = /^\p{Script=Han}{7}$/u
const badLines = POEMS.flatMap((p) => p.lines.filter((line) => !HAN.test(line)).map((l) => `${l}（${p.author}）`))
check(badLines.length === 0, `every line is exactly seven Han characters${badLines.length ? `: ${badLines.join('、')}` : ''}`)

const keys = POEMS.map((p) => p.lines.join(''))
check(new Set(keys).size === keys.length, 'no duplicate couplets')
check(POEMS.every((p) => p.author && p.title), 'every couplet has an author and a title')
check(POEMS.length >= 96, `at least two days of half hours without repeats (${POEMS.length})`)

const cycle = new Set(Array.from({ length: POEMS.length }, (_, i) => poemForSlot(i).lines.join('')))
check(cycle.size === POEMS.length, 'one full cycle shows every couplet once')

const sameAuthorRuns = Array.from({ length: POEMS.length }, (_, i) => poemForSlot(i).author === poemForSlot(i + 1).author).filter(Boolean).length
check(sameAuthorRuns <= POEMS.length / 10, `consecutive half hours rarely share a poet (${sameAuthorRuns})`)

const t = Date.UTC(2026, 8, 24, 10, 29, 59, 0)
check(poemSlot(t) + 1 === poemSlot(t + 1000), 'slot changes on the half hour')
check(msUntilNextSlot(t) === 1000, 'time to next slot is measured to the boundary')
check(poemSlot(t + POEM_SLOT_MS) === poemSlot(t) + 1, 'one slot per half hour')

if (failed) {
  console.error(`${failed} poem check(s) failed`)
  process.exit(1)
}
console.log('poem checks passed')
