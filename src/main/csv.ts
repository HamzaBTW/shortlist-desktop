/**
 * Parses CSV text (RFC 4180): quoted fields, doubled quotes, commas and line
 * breaks inside quotes, CRLF or LF, a leading byte-order mark. Never throws.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0

  const endField = (): void => {
    row.push(field)
    field = ''
  }
  const endRow = (): void => {
    endField()
    if (!(row.length === 1 && row[0] === '')) rows.push(row)
    row = []
  }

  for (; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === ',') endField()
    else if (ch === '\n') endRow()
    else if (ch === '\r') {
      if (text[i + 1] !== '\n') endRow()
    } else field += ch
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}
