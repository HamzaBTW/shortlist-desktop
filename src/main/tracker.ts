import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { matchKey, normalizeStatus, type TrackerData, type TrackerRow } from '../shared/tracker.ts'
import { parseCsv } from './csv.ts'

// Reads job_search_tracker.csv. Never writes it.

const FILE = 'job_search_tracker.csv'
const MAX_BYTES = 5 * 1024 * 1024

export function readTracker(workspace: string): TrackerData {
  const file = path.join(workspace, FILE)
  let size: number
  try {
    size = statSync(file).size
  } catch {
    return { found: false, rows: [] }
  }
  if (size > MAX_BYTES) return { found: true, rows: [], error: 'tooLarge' }

  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return { found: true, rows: [], error: 'unreadable' }
  }
  return parseTracker(text)
}

export function parseTracker(text: string): TrackerData {
  const [header, ...lines] = parseCsv(text)
  if (!header) return { found: true, rows: [] }
  const col = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]))
  if (!col.has('company') || !col.has('role') || !col.has('status')) return { found: true, rows: [], error: 'noHeader' }

  const rows: TrackerRow[] = []
  lines.forEach((cells, n) => {
    const get = (name: string): string => {
      const i = col.get(name)
      return i === undefined ? '' : (cells[i] ?? '').trim()
    }
    const company = get('company')
    const role = get('role')
    if (!company && !role) return
    const fit = Number(get('fit_rating'))
    rows.push({
      id: `row-${n + 2}`,
      matchKey: matchKey(company, role),
      date: get('date'),
      company,
      sector: get('sector'),
      role,
      roleType: get('role_type'),
      channel: get('channel'),
      status: normalizeStatus(get('status')),
      contactPerson: get('contact_person'),
      fitRating: get('fit_rating') !== '' && Number.isFinite(fit) && fit >= 0 && fit <= 100 ? Math.round(fit) : null,
      notes: get('notes'),
      cvFile: get('cv_file'),
      coverLetterFile: get('cover_letter_file'),
      source: get('source'),
      deadline: get('deadline')
    })
  })
  return { found: true, rows }
}
