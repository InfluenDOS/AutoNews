/**
 * Parity check against crawler/test_matching.py. The feed badges are computed in the
 * browser while article_hits are computed in Python, so the two must agree.
 *
 * Run: npm run test:match
 */

import { articleMatchesKeyword, termWeight } from '../src/lib/normalize.ts'

const failures: string[] = []

function check(label: string, got: unknown, want: unknown): void {
  if (got !== want) failures.push(`${label}: got ${String(got)}, want ${String(want)}`)
}

const art = (title: string, summary = '') => ({ title, summary })

check("termWeight('Srbija')", termWeight('Srbija'), 0.3)
check("termWeight('izbori u Srbiji')", termWeight('izbori u Srbiji'), 1.0)
check("termWeight('izbori')", termWeight('izbori'), 0.8)
check("termWeight('rat')", termWeight('rat'), 0.5)

const longIntent = {
  phrase: '中国籍非法移民在塞尔维亚被拘留的情况',
  match_mode: 'strict' as const,
  match_groups: [
    ['kineski državljani', 'kineskih državljana', 'Chinese nationals'],
    ['ilegalni migranti', 'ilegalne migracije', 'illegal migrants'],
    ['Srbija', 'Srbiji', 'Serbia'],
    ['pritvor', 'detention'],
  ],
  search_terms: [],
}

check(
  '3 of 4 facets present → match',
  articleMatchesKeyword(
    art(
      'Kineski državljani bez dokumenata pronađeni u Srbiji',
      'Policija je otkrila grupu ilegalnih migranata na jugu zemlje.',
    ),
    longIntent,
  ),
  true,
)
check(
  'only the generic location facet → no match',
  articleMatchesKeyword(art('U Srbiji otvoren novi bazen'), longIntent),
  false,
)
check(
  'anchor facet missing → no match',
  articleMatchesKeyword(
    art('Ilegalni migranti u Srbiji', 'Grupa migranata iz Sirije u pritvoru.'),
    longIntent,
  ),
  false,
)

const looseWithGeneric = {
  phrase: '塞尔维亚大选',
  match_mode: 'loose' as const,
  match_groups: [],
  search_terms: ['izbori u Srbiji', 'parlamentarni izbori', 'Srbija', 'Serbia'],
}
check(
  "generic 'Srbija' alone no longer matches",
  articleMatchesKeyword(art('U Srbiji otvoren novi bazen'), looseWithGeneric),
  false,
)
check(
  'specific term still matches',
  articleMatchesKeyword(art('Parlamentarni izbori zakazani za decembar'), looseWithGeneric),
  true,
)

check(
  'beat subscription still matches',
  articleMatchesKeyword(art('U Srbiji otvoren novi bazen'), {
    phrase: '塞尔维亚',
    match_mode: 'loose' as const,
    match_groups: [],
    search_terms: ['Srbija', 'Srbiji', 'Serbia'],
  }),
  true,
)

const pmIntent = {
  phrase: '塞尔维亚总理',
  match_mode: 'loose' as const,
  match_groups: [],
  search_terms: ['premijer Srbije', 'predsednica vlade'],
  exclude_terms: ['premijera filma', 'filmska premijera'],
}
check(
  'wrong sense vetoed',
  articleMatchesKeyword(
    art('Premijer Srbije na premijeri filma', 'Filmska premijera u Beogradu.'),
    pmIntent,
  ),
  false,
)
check(
  'right sense kept',
  articleMatchesKeyword(art('Premijer Srbije primio delegaciju'), pmIntent),
  true,
)

const twoFacets = {
  phrase: '中国在塞尔维亚的投资',
  match_mode: 'strict' as const,
  match_groups: [
    ['kineske investicije', 'kineski investitori', 'Chinese investment'],
    ['Srbija', 'Srbiji', 'Serbia'],
  ],
  search_terms: [],
}
check(
  'both facets present → match',
  articleMatchesKeyword(art('Kineske investicije u Srbiji dostigle rekord'), twoFacets),
  true,
)
check(
  'one of two facets → no match',
  articleMatchesKeyword(art('Kineske investicije u Mađarskoj'), twoFacets),
  false,
)

const electionIntent = {
  phrase: '塞尔维亚选举',
  match_mode: 'loose' as const,
  match_groups: [],
  search_terms: ['izbori u Srbiji', 'parlamentarni izbori Srbija', 'izbori 2024 Srbija'],
}
for (const headline of [
  'Blokaderi ne znaju šta žele – prvo su tražili izbore',
  'Вучић: Избори ће бити расписани за неколико дана',
  'Vučić otkrio dva datuma za održavanje izbora',
  'Građani na izborima odlučuju',
  'NISU OČEKIVALI IZBORE? Vučić o izborima',
]) {
  check(`implied Serbia: ${headline}`, articleMatchesKeyword(art(headline), electionIntent), true)
}
check(
  'election elsewhere is not an implied-Serbia story',
  articleMatchesKeyword(art('Izbori u Hrvatskoj u aprilu'), electionIntent),
  false,
)

const pmTerms = {
  phrase: '总理',
  match_mode: 'loose' as const,
  match_groups: [],
  search_terms: ['premijer', 'premijer Srbije', 'predsednik vlade Srbije'],
}
check(
  'bare premijer cannot carry a match',
  articleMatchesKeyword(art('Premijer Hrvatske u Zagrebu'), pmTerms),
  false,
)
check(
  'premijer Srbije still matches',
  articleMatchesKeyword(art('Premijer Srbije primio delegaciju'), pmTerms),
  true,
)

// Sense cases exercised through a single-term keyword.
const senseCases: [string, string, boolean][] = [
  ['vlada', 'Vladimir Putin u Moskvi', false],
  ['vlada', 'Vlade Srbije donela odluku', true],
  ['kineski', 'Kinematografija u Beogradu', false],
  ['kineski', 'Kineskih investitora sve više', true],
  ['srbija', 'Srbijagas potpisao ugovor', false],
  ['srbija', 'U Srbiji pada kiša', true],
  ['izbori', 'Izborni proces počinje', true],
  ['izbori', 'Izbor najboljeg glumca', false],
  ['premijer', 'Premijera filma u Beogradu', false],
  ['premijer', 'Premijeru Srbije uručena nagrada', true],
]
for (const [term, headline, want] of senseCases) {
  check(
    `${term} vs ${headline}`,
    articleMatchesKeyword(art(headline), {
      phrase: term,
      match_mode: 'loose' as const,
      match_groups: [],
      search_terms: [term],
    }),
    want,
  )
}

if (failures.length > 0) {
  console.error(`FAILED (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('all frontend matching checks passed')
