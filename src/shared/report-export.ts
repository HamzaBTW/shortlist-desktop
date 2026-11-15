import { percent, type ReportStats, type SkillReport } from './reports.ts'
import type { TrackerRow } from './tracker.ts'

// "Export my report": a self-contained page in Shortlist's own design, built from the numbers
// the Reports screen already computed (no AI). Saved as HTML, or printed to PDF by the main
// process in a hidden window with scripts off and no network. Every value from the tracker or a
// skills report is escaped. Light-relax colours (design/tokens.json) read best on paper.

const C = {
  page: '#ffffff',
  surface: '#fcf8f2',
  sunken: '#ece4d8',
  line: '#e0d6c8',
  lineStrong: '#8a7d6e',
  ink: '#2b2219',
  muted: '#5f5448',
  accent: '#0b6672',
  accentSoft: '#d6eef0'
}

export type Translate = (key: string, options?: Record<string, unknown>) => string

export interface ExportInput {
  stats: ReportStats
  rows: TrackerRow[]
  skills: SkillReport | null
  t: Translate
  locale: string
  /** ISO date the report is made. */
  generated: string
  /** data:font/woff2;base64,... for Manrope (and JetBrains Mono), or '' for system fonts. */
  fontSans: string
  fontMono: string
  /** The logo as inline SVG markup (the app's own file). */
  markSvg: string
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only data: URIs of fonts may go into the page's CSS. */
function fontFace(family: string, url: string): string {
  return /^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/.test(url)
    ? `@font-face{font-family:'${family}';font-weight:200 800;src:url(${url}) format('woff2')}`
    : ''
}

/** The logo must be the app's own SVG: no scripts, links or event handlers. */
function safeMark(svg: string): string {
  return /^<svg[\s\S]*<\/svg>\s*$/.test(svg.trim()) && !/<script|on\w+\s*=|href|<foreignObject/i.test(svg) ? svg.trim() : ''
}

function monthName(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' })
}

function bars(rows: [string, number][], max: number): string {
  return rows
    .map(([label, value]) => {
      const w = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0
      return `<div class="hbar"><span>${escapeHtml(label)}</span><div class="track"><div class="fill" style="width:${w.toFixed(1)}%"></div></div><span class="n">${value}</span></div>`
    })
    .join('')
}

function monthsSvg(stats: ReportStats, t: Translate, locale: string, generated: string): string {
  const shown = stats.months.slice(-12)
  if (shown.length === 0) return `<p class="muted">${escapeHtml(t('export.noMonths'))}</p>`
  const max = Math.max(1, ...shown.map((m) => m.count))
  const W = 520
  const base = 150
  const slot = (W - 40) / shown.length
  const bw = Math.min(50, slot * 0.6)
  const current = generated.slice(0, 7)
  const label = shown.map((m) => `${monthName(m.month, locale)} ${m.count}`).join(', ')
  const parts = shown.map((m, i) => {
    const h = Math.round((m.count / max) * 120)
    const x = 20 + slot * i + (slot - bw) / 2
    const y = base - h
    const r = Math.min(4, h)
    const cx = x + bw / 2
    const soFar = m.month === current ? `<text x="${cx}" y="${base + 34}" text-anchor="middle" class="lbl">${escapeHtml(t('export.soFar'))}</text>` : ''
    return `<path class="bar" d="M${x} ${base} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + bw - r} Q${x + bw} ${y} ${x + bw} ${y + r} V${base} Z"/><text x="${cx}" y="${y - 7}" text-anchor="middle" class="val">${m.count}</text><text x="${cx}" y="${base + 18}" text-anchor="middle" class="lbl">${escapeHtml(monthName(m.month, locale))}</text>${soFar}`
  })
  return `<svg viewBox="0 0 ${W} 190" width="100%" role="img" aria-label="${escapeHtml(t('export.monthsAria', { list: label }))}"><line x1="20" y1="${base + 0.5}" x2="${W - 20}" y2="${base + 0.5}" class="axis"/>${parts.join('')}</svg>`
}

export function buildReportHtml(input: ExportInput): string {
  const { stats: s, rows, skills, t, locale, generated } = input
  const pct = (a: number, b: number): string => `${percent(a, b) ?? 0}%`
  const date = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

  const source =
    s.sent === 0
      ? t('export.none')
      : `${s.firstDate ? t('export.source', { count: s.sent, date: date(s.firstDate) }) : t('export.sourceNoDate', { count: s.sent })} ${t('export.draftsLeftOut')}`

  const tiles = s.showRates
    ? [
        [t('export.tile.sent'), String(s.sent), t('export.tile.sentNote', { count: s.sent })],
        [t('export.tile.response'), pct(s.heardBack, s.sent), t('export.tile.responseNote', { heard: s.heardBack, sent: s.sent })],
        [t('export.tile.interviews'), String(s.interviewed), t('export.tile.interviewsNote', { count: s.offers })],
        [t('export.tile.finished'), String(s.finished), t('export.tile.finishedNote', { rejections: s.rejections, rate: pct(s.rejections, s.finished) })]
      ]
    : [
        [t('export.count.sent'), String(s.sent), ''],
        [t('export.count.waiting'), String(s.open), ''],
        [t('export.count.interviewing'), String(s.interviewed), ''],
        [t('export.count.finished'), String(s.finished), '']
      ]

  const tilesHtml = tiles
    .map(([label, value, note]) => `<div class="tile"><div class="label">${escapeHtml(label)}</div><div class="num">${escapeHtml(value)}</div>${note ? `<div class="muted">${escapeHtml(note)}</div>` : ''}</div>`)
    .join('')

  const funnel = bars(
    [
      [t('export.stage.applied'), s.sent],
      [t('export.stage.heard'), s.heardBack],
      [t('export.stage.interviewed'), s.interviewed],
      [t('export.stage.offer'), s.offers]
    ],
    s.sent
  )

  const channelRows = s.channels
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.channel === '—' ? t('export.noChannel') : c.channel)}</td><td class="num-c">${c.sent}</td><td class="num-c">${c.heardBack}</td>${s.showRates ? `<td class="num-c">${pct(c.heardBack, c.sent)}</td>` : ''}</tr>`
    )
    .join('')

  const sentRows = rows
    .filter((r) => r.status !== 'drafted' && r.status !== 'ranked')
    .sort((a, b) => b.date.localeCompare(a.date) || a.company.localeCompare(b.company))
  const appRows = sentRows
    .map(
      (r) =>
        `<tr><td class="nowrap">${escapeHtml(r.date || '—')}</td><td>${escapeHtml(r.company || '—')}</td><td>${escapeHtml(r.role || '—')}</td><td>${escapeHtml(r.channel || '—')}</td><td>${escapeHtml(t(`status.${r.status}`, { defaultValue: r.status }))}</td></tr>`
    )
    .join('')

  const gaps =
    skills && skills.gaps.length > 0
      ? `<section class="panel"><h2>${escapeHtml(t('export.skills'))}</h2><p class="muted">${escapeHtml(t('export.skillsFrom', { date: skills.date }))}</p><ul class="gaps">${skills.gaps
          .slice(0, 10)
          .map((g) => `<li><span class="gap">${escapeHtml(g.skill)}</span><span class="badge">${escapeHtml(g.priority)}</span>${g.type ? `<span class="muted">${escapeHtml(g.type)}</span>` : ''}</li>`)
          .join('')}</ul></section>`
      : ''

  const body =
    s.sent === 0
      ? `<section class="panel"><p>${escapeHtml(t('export.emptyLead'))}</p></section>`
      : `${s.showRates ? '' : `<p class="note">${escapeHtml(t('export.early', { min: 5, count: s.finished }))}</p>`}
<section class="tiles">${tilesHtml}</section>
<div class="grid">
<section class="panel"><h2>${escapeHtml(t('export.funnel'))}</h2>${funnel}</section>
${s.showRates ? `<section class="panel"><h2>${escapeHtml(t('export.perMonth'))}</h2>${monthsSvg(s, t, locale, generated)}${s.undated > 0 ? `<p class="muted">${escapeHtml(t('export.undated', { count: s.undated }))}</p>` : ''}</section>` : ''}
<section class="panel"><h2>${escapeHtml(t('export.byChannel'))}</h2><table><thead><tr><th>${escapeHtml(t('export.col.channel'))}</th><th class="num-c">${escapeHtml(t('export.col.sent'))}</th><th class="num-c">${escapeHtml(t('export.col.heard'))}</th>${s.showRates ? `<th class="num-c">${escapeHtml(t('export.col.rate'))}</th>` : ''}</tr></thead><tbody>${channelRows}</tbody></table>${s.showRates ? `<p class="muted">${escapeHtml(t('export.smallNumbers'))}</p>` : ''}</section>
${gaps}
</div>
<section class="panel apps"><h2>${escapeHtml(t('export.applications'))}</h2><table><thead><tr><th>${escapeHtml(t('export.col.date'))}</th><th>${escapeHtml(t('export.col.company'))}</th><th>${escapeHtml(t('export.col.role'))}</th><th>${escapeHtml(t('export.col.channel'))}</th><th>${escapeHtml(t('export.col.status'))}</th></tr></thead><tbody>${appRows}</tbody></table></section>`

  const css = `${fontFace('Manrope', input.fontSans)}${fontFace('JetBrains Mono', input.fontMono)}
*{box-sizing:border-box}
@page{size:A4;margin:16mm 14mm}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:${C.page};color:${C.ink};font:400 13px/19px 'Manrope',system-ui,'Segoe UI',sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 24px;display:flex;flex-direction:column;gap:16px}
header{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:1px solid ${C.line};padding-bottom:16px}
.brand{display:flex;align-items:center;gap:8px;font:800 16px/22px 'Manrope',sans-serif;color:${C.ink}}
.brand svg{height:22px;width:auto}
h1{margin:6px 0 2px;font:800 26px/32px 'Manrope',sans-serif;letter-spacing:-.01em}
h2{margin:0 0 10px;font:700 15px/22px 'Manrope',sans-serif}
.muted{color:${C.muted};font-size:12px;line-height:17px;margin:4px 0 0}
.note{margin:0;background:${C.accentSoft};border-radius:12px;padding:10px 14px}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.tile,.panel{background:${C.surface};border:1px solid ${C.line};border-radius:16px;padding:16px;break-inside:avoid}
.label{font:700 11px/14px 'Manrope',sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${C.muted}}
.num{font:600 24px/30px 'JetBrains Mono',ui-monospace,monospace;margin-top:6px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.hbar{display:grid;grid-template-columns:96px 1fr 32px;gap:10px;align-items:center;margin:8px 0}
.track{height:12px;border-radius:4px;background:${C.sunken}}
.fill{height:12px;border-radius:0 4px 4px 0;background:${C.accent}}
.n,.num-c{font-family:'JetBrains Mono',ui-monospace,monospace;text-align:right}
svg .bar{fill:${C.accent}} svg .axis{stroke:${C.lineStrong};stroke-width:1}
svg .val{fill:${C.ink};font:600 12px 'JetBrains Mono',monospace} svg .lbl{fill:${C.muted};font:500 11px 'Manrope',sans-serif}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font:700 10px/14px 'Manrope',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};text-align:left;padding:0 6px 6px}
td{padding:6px;border-top:1px solid ${C.line};vertical-align:top}
tr{break-inside:avoid}
.nowrap{white-space:nowrap}
.gaps{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.gaps li{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.gap{font-weight:600;flex:1 1 180px}
.gaps .muted{margin:0;white-space:nowrap}
.made{white-space:nowrap}
.badge{border:1px solid ${C.lineStrong};border-radius:999px;padding:0 8px;font:700 11px/18px 'Manrope',sans-serif}
footer{color:${C.muted};font-size:11px;border-top:1px solid ${C.line};padding-top:10px}
@media (max-width:700px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:1fr}}`

  return `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:">
<title>${escapeHtml(t('export.title'))} · ${escapeHtml(generated)}</title>
<style>${css}</style>
</head>
<body>
<main>
<header>
<div><div class="brand">${safeMark(input.markSvg)}Shortlist</div><h1>${escapeHtml(t('export.title'))}</h1><p class="muted">${escapeHtml(source)}</p></div>
<div class="muted made">${escapeHtml(t('export.generated', { date: date(generated) }))}</div>
</header>
${body}
<footer>${escapeHtml(t('export.footer', { date: generated }))}</footer>
</main>
</body>
</html>
`
}
