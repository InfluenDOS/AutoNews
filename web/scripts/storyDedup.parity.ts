import {
  groupDuplicateStories,
  groupStoriesWithPairs,
  titleTokens,
} from '../src/lib/storyDedup.ts'
import type { Article } from '../src/types.ts'

function article(id: string, title: string, titleZh: string, publishedAt: string): Article {
  return {
    id,
    source: `source-${id}`,
    title,
    title_zh: titleZh,
    summary: '',
    url: `https://example.com/${id}`,
    published_at: publishedAt,
    created_at: publishedAt,
  }
}

function check(name: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL ${name}`)
  console.log(`ok  ${name}`)
}

const published = '2026-09-05T20:59:00+00:00'
const a = article(
  'a',
  'Uhapsen kineski drzavljanin zbog mita',
  '塞尔维亚逮捕一名23岁中国公民 涉嫌向警察行贿',
  published,
)
const b = article(
  'b',
  'Kineski drzavljanin uhapšen zbog pokušaja podmićivanja',
  '塞尔维亚逮捕一名涉嫌行贿的中国公民',
  '2026-09-05T20:53:00+00:00',
)
const c = article(
  'c',
  'MUP priveo kineskog državljanina',
  '中国公民涉嫌向塞尔维亚边境警察行贿被拘',
  '2026-09-05T20:33:00+00:00',
)

check('spaced CJK titles use bigrams', titleTokens(a.title_zh ?? '').size > 8)

const paired = groupStoriesWithPairs(
  [a, b, c],
  [
    { lo: 'a', hi: 'b' },
    { lo: 'b', hi: 'c' },
  ],
)
check('transitive pairs form one story', paired.length === 1)
check('one canonical plus two alternate sources', paired[0].alts.length === 2)
check('newest source is the canonical story card', paired[0].article.id === 'a')

const different = article(
  'd',
  'Poplave pogodile Beograd',
  '贝尔格莱德遭遇洪水',
  published,
)
check('unrelated story remains separate', groupDuplicateStories([a, different]).length === 2)

console.log('all frontend story grouping checks passed')
