// How many postings each search source may contribute to one "Find new jobs" run.
// The framework (tools/source_mix.py) owns the split; the app only passes `--slots`.

export const SOURCES = ['linkedin', 'freehire', 'indeed', 'careers'] as const
export type Source = (typeof SOURCES)[number]
/** What a posting's source is shown as: one of the four, or "other" (its own tag is shown as text). */
export type SourceLabel = Source | 'other'

export type Slots = Record<Source, number>

export const DEFAULT_SLOTS: Slots = { linkedin: 5, freehire: 5, indeed: 5, careers: 5 }
export const MAX_SLOT = 999

/** Whole numbers 0 or more; anything else keeps the base value. */
export function cleanSlots(input: unknown, base: Slots = DEFAULT_SLOTS): Slots {
  const out: Slots = { ...base }
  if (typeof input !== 'object' || input === null) return out
  const raw = input as Record<string, unknown>
  for (const s of SOURCES) {
    const v = raw[s]
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_SLOT) out[s] = v
  }
  return out
}

/** The input for /scrape: `--slots linkedin=5,freehire=5,indeed=5,careers=5`. */
export function slotsArg(slots: Slots): string {
  return `--slots ${SOURCES.map((s) => `${s}=${slots[s]}`).join(',')}`
}

/** The framework's mapping (source_mix.py): the portal tag contains the source's name. */
export function sourceOf(portal: string): SourceLabel {
  const p = portal.toLowerCase()
  return SOURCES.find((s) => p.includes(s)) ?? 'other'
}

const SLOTS_INPUT = /^--slots (?:linkedin|freehire|indeed|careers)=\d{1,3}(?:,(?:linkedin|freehire|indeed|careers)=\d{1,3}){0,3}$/
const DROP_INPUT = /^drop [A-Za-z0-9._-]{1,300}(?:,[A-Za-z0-9._-]{1,300}){0,49}$/

/** What /scrape may be given from the screens: nothing, a slots override, or a list of keys to close. */
export function isScrapeInput(input: string): boolean {
  return input === '' || SLOTS_INPUT.test(input) || DROP_INPUT.test(input)
}
