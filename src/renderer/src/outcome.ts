import type { BoardColumn } from '../../shared/tracker.ts'

// "Update status": what the person picks, and the request it becomes for the
// framework's /outcome command (the tracker's only writer). The app never edits the CSV.

export const OUTCOME_CHOICES = [
  'applied',
  'interview',
  'offer',
  'hired',
  'rejected',
  'no_response',
  'withdrawn',
  'offer_declined'
] as const
export type OutcomeChoice = (typeof OUTCOME_CHOICES)[number]

export const CLOSED_CHOICES: OutcomeChoice[] = ['hired', 'rejected', 'no_response', 'withdrawn', 'offer_declined']

const COLUMN_OF: Record<OutcomeChoice, BoardColumn> = {
  applied: 'applied',
  interview: 'interviewing',
  offer: 'offer',
  hired: 'offer',
  rejected: 'closed',
  no_response: 'closed',
  withdrawn: 'closed',
  offer_declined: 'closed'
}

/** The choices that move a card forward from its column (never backwards, never to where it is). */
export function choicesFrom(column: BoardColumn): OutcomeChoice[] {
  const order: BoardColumn[] = ['shortlisted', 'applied', 'interviewing', 'offer', 'closed']
  const here = order.indexOf(column)
  return OUTCOME_CHOICES.filter((c) => {
    const to = order.indexOf(COLUMN_OF[c])
    return to > here || (c === 'hired' && column === 'offer') || (COLUMN_OF[c] === 'closed' && column !== 'closed')
  })
}

const SENTENCE: Record<OutcomeChoice, string> = {
  applied: 'I submitted this application',
  interview: 'I have been invited to interview',
  offer: 'I received an offer',
  hired: 'I accepted the offer (hired)',
  rejected: 'I was not selected (rejected)',
  no_response: 'I got no reply (no_response)',
  withdrawn: 'I withdrew my application (withdrawn)',
  offer_declined: 'I declined the offer (offer_declined)'
}

/** Strips characters that would break the one-line command argument. */
function clean(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The text after "/outcome": company and role first (how /outcome matches the row), then what happened. */
export function outcomeRequest(company: string, role: string, choice: OutcomeChoice, date: string, note: string): string {
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date) ? ` on ${date}` : ''
  const extra = clean(note)
  return [
    clean(`${company} ${role}`),
    `- status update: ${SENTENCE[choice]}${when}.`,
    extra ? `Note from me: ${extra}.` : '',
    'Record it now; ask me only if something essential is missing.'
  ]
    .filter(Boolean)
    .join(' ')
}
