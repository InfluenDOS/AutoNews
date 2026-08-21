/** Short classical lines for quiet decorative accents. */
export type PoemSnippet = {
  lines: string[]
  source: string
}

export const POEM_SNIPPETS: PoemSnippet[] = [
  { lines: ['海内存知己', '天涯若比邻'], source: '王勃《送杜少府之任蜀州》' },
  { lines: ['不识庐山真面目', '只缘身在此山中'], source: '苏轼《题西林壁》' },
  { lines: ['欲穷千里目', '更上一层楼'], source: '王之涣《登鹳雀楼》' },
  { lines: ['会当凌绝顶', '一览众山小'], source: '杜甫《望岳》' },
  { lines: ['山重水复疑无路', '柳暗花明又一村'], source: '陆游《游山西村》' },
  { lines: ['落红不是无情物', '化作春泥更护花'], source: '龚自珍《己亥杂诗》' },
  { lines: ['纸上得来终觉浅', '绝知此事要躬行'], source: '陆游《冬夜读书示子聿》' },
  { lines: ['博观而约取', '厚积而薄发'], source: '苏轼《稼说送张琥》' },
  { lines: ['风声雨声读书声', '声声入耳'], source: '顾宪成联' },
  { lines: ['家事国事天下事', '事事关心'], source: '顾宪成联' },
  { lines: ['读万卷书', '行万里路'], source: '董其昌《画旨》' },
  { lines: ['文章本天成', '妙手偶得之'], source: '陆游《文章》' },
]

export function pickPoem(seed = Date.now()): PoemSnippet {
  const i = Math.abs(seed) % POEM_SNIPPETS.length
  return POEM_SNIPPETS[i]!
}
