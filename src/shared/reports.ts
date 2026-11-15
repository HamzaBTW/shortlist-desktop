import type { TrackerRow } from './tracker.ts'

// The Reports screen's numbers, worked out in the app from the tracker with /html-report's rules:
// - drafted rows are left out of every number (never sent);
// - a stage counts as reached when the current status implies it OR the application's
//   outcome.md ticks it (current status alone undercounts: a rejection after an interview
//   still reached the interview);
// - rejection rate = (rejected + no reply) / applications with a final outcome; offer declined
//   and withdrawn are final but not rejections; interview, offer and applied rows are unresolved.
// "Heard back" (the response rate) = any answer from the employer: an interview, an offer or a
// rejection. No reply and withdrawn don't count.
// Under MIN_FINISHED finished applications the screen shows counts only.

export const MIN_FINISHED = 5

/** Stages an outcome.md ticks, keyed by matchName(company, role). */
export interface OutcomeStages {
  interview: boolean
  offer: boolean
}

/** Lower case, letters and digits only: how /html-report fuzzy-matches outcome files to rows. */
export function matchName(company: string, role: string): string {
  return `${company} ${role}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Reads "# Outcome: <Company> — <Role>" and the stage checkboxes of one outcome.md. */
export function parseOutcome(markdown: string): { key: string; stages: OutcomeStages } | null {
  const head = /^#\s*Outcome:\s*(.+?)\s+[—–-]\s+(.+?)\s*$/m.exec(markdown)
  if (!head) return null
  const section = /^##\s*Interview stages reached\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(markdown)?.[1] ?? ''
  let interview = false
  let offer = false
  for (const line of section.split(/\r?\n/)) {
    const m = /^\s*[-*]\s*\[[xX]\]\s*(.+)$/.exec(line)
    if (!m) continue
    if (/offer/i.test(m[1]!)) offer = true
    else interview = true
  }
  return { key: matchName(head[1]!, head[2]!), stages: { interview, offer } }
}

const FINAL = new Set(['hired', 'offer_declined', 'rejected', 'no_response', 'withdrawn', 'expired'])
const KNOWN = new Set(['drafted', 'ranked', 'applied', 'interview', 'offer', ...FINAL])

export interface ChannelStat {
  channel: string
  sent: number
  heardBack: number
}

export interface MonthStat {
  /** YYYY-MM */
  month: string
  count: number
}

export interface ReportStats {
  sent: number
  drafted: number
  heardBack: number
  interviewed: number
  offers: number
  hired: number
  finished: number
  rejections: number
  /** Rows still waiting (applied, interview, offer). */
  open: number
  /** Unknown status values, named once (they count as closed). */
  unknownStatuses: string[]
  months: MonthStat[]
  /** Sent rows whose date has no month (e.g. a bare year). */
  undated: number
  channels: ChannelStat[]
  firstDate: string | null
  /** Rates only from MIN_FINISHED finished applications. */
  showRates: boolean
}

export function computeStats(rows: TrackerRow[], outcomes: Record<string, OutcomeStages> = {}): ReportStats {
  const sentRows = rows.filter((r) => r.status !== 'drafted' && r.status !== 'ranked')
  const drafted = rows.filter((r) => r.status === 'drafted').length
  const unknown = new Set<string>()
  let heardBack = 0
  let interviewed = 0
  let offers = 0
  let hired = 0
  let finished = 0
  let rejections = 0
  let open = 0
  const months = new Map<string, number>()
  let undated = 0
  const channels = new Map<string, ChannelStat>()
  let firstDate: string | null = null

  for (const r of sentRows) {
    const s = r.status
    if (!KNOWN.has(s)) unknown.add(s)
    const o = outcomes[matchName(r.company, r.role)]
    const reachedOffer = s === 'offer' || s === 'hired' || s === 'offer_declined' || o?.offer === true
    const reachedInterview = reachedOffer || s === 'interview' || o?.interview === true
    const answered = reachedInterview || s === 'rejected'
    if (answered) heardBack++
    if (reachedInterview) interviewed++
    if (reachedOffer) offers++
    if (s === 'hired') hired++
    if (FINAL.has(s) || !KNOWN.has(s)) finished++
    if (s === 'rejected' || s === 'no_response') rejections++
    if (s === 'applied' || s === 'interview' || s === 'offer') open++

    const m = /^(\d{4})-(\d{2})/.exec(r.date.trim())
    if (m) {
      const key = `${m[1]}-${m[2]}`
      months.set(key, (months.get(key) ?? 0) + 1)
      const day = r.date.trim().slice(0, 10)
      if (firstDate === null || day < firstDate) firstDate = day
    } else undated++

    const label = r.channel.trim() || '—'
    const key = label.toLowerCase()
    const c = channels.get(key) ?? { channel: label, sent: 0, heardBack: 0 }
    c.sent++
    if (answered) c.heardBack++
    channels.set(key, c)
  }

  return {
    sent: sentRows.length,
    drafted,
    heardBack,
    interviewed,
    offers,
    hired,
    finished,
    rejections,
    open,
    unknownStatuses: [...unknown],
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
    undated,
    channels: [...channels.values()].sort((a, b) => b.sent - a.sent || a.channel.localeCompare(b.channel)),
    firstDate,
    showRates: finished >= MIN_FINISHED
  }
}

/** Whole-number percent, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

export interface SkillGap {
  priority: string
  skill: string
  type: string
}

export interface SkillReport {
  /** YYYY-MM-DD from the file name. */
  date: string
  file: string
  gaps: SkillGap[]
}

/** The newest aggregate upskill report name (report-YYYY-MM-DD.md) from a folder listing. */
export function latestReport(names: string[]): string | null {
  const reports = names.filter((n) => /^report-\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort()
  return reports.at(-1) ?? null
}

const clip = (s: string, n: number): string => s.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n)

/** The "## Gap Heatmap" table of an upskill report: priority, skill or area, type. */
export function parseGaps(markdown: string): SkillGap[] {
  const section = /^##\s*Gap Heatmap\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(markdown)?.[1] ?? ''
  const gaps: SkillGap[] = []
  for (const line of section.split(/\r?\n/)) {
    if (!/^\s*\|/.test(line)) continue
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 3 || /^-+$/.test(cells[0]!.replace(/:/g, '')) || /^priority$/i.test(cells[0]!)) continue
    const [priority, skill, type] = cells
    if (!skill || skill === '...') continue
    gaps.push({ priority: clip(priority!, 20), skill: clip(skill, 80), type: clip(type!, 20) })
    if (gaps.length >= 50) break
  }
  return gaps
}
