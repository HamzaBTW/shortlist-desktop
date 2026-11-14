// Finding a job posting's web link in what a person pasted or a tracker row records. Pure.

const URL_AT_START = /https?:\/\/[^\s<>"')\]]+/i

/** The first http(s) link in a text, without trailing punctuation; null when there is none. */
export function firstWebLink(text: string): string | null {
  const m = URL_AT_START.exec(text)
  if (!m) return null
  const url = m[0].replace(/[.,;:!?]+$/, '')
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** The link a job's title should open: the tracker's source column first, else the pasted input. */
export function postingLink(source: string | null | undefined, input: string | null | undefined): string | null {
  return (source ? firstWebLink(source) : null) ?? (input ? firstWebLink(input) : null)
}
