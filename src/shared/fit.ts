// "Short" view of a command's Markdown answer: each section keeps its heading and its first
// block (a paragraph, the first three list items, or the top of a table). "Detail" is the text
// as it is. Pure text in, text out; nothing is asked of the AI again.

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+/
const MAX_ITEMS = 3
const MAX_TABLE_LINES = 6

function blocks(text: string): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (line.trim() === '') {
      if (cur.length) out.push(cur)
      cur = []
    } else if (/^#{1,6}\s/.test(line)) {
      // A heading is always a block of its own, even with no blank line after it.
      if (cur.length) out.push(cur)
      out.push([line])
      cur = []
    } else {
      cur.push(line)
    }
  }
  if (cur.length) out.push(cur)
  return out
}

function trim(block: string[]): string[] {
  const first = LIST_LINE.exec(block[0]!)
  if (first) {
    const base = first[1]!.length
    let items = 0
    const kept: string[] = []
    for (const line of block) {
      const m = LIST_LINE.exec(line)
      if (m && m[1]!.length <= base) {
        items += 1
        if (items > MAX_ITEMS) break
      }
      kept.push(line)
    }
    return kept
  }
  if (block[0]!.trimStart().startsWith('|')) return block.slice(0, MAX_TABLE_LINES)
  return block
}

export const isHeading = (block: string[]): boolean => /^#{1,6}\s/.test(block[0]!)

/**
 * keepQuestion: keep the last block as it is, so a closing question ("Should I proceed with
 * drafting...?") is never hidden by the short view.
 */
export function shortenFit(text: string, keepQuestion = false): string {
  const all = blocks(text)
  const out: string[][] = []
  let bodyInSection = 0
  all.forEach((block, i) => {
    if (isHeading(block)) {
      out.push(block)
      bodyInSection = 0
      return
    }
    const last = keepQuestion && i === all.length - 1
    if (bodyInSection === 0 || last) out.push(last ? block : trim(block))
    bodyInSection += 1
  })
  return out.map((b) => b.join('\n')).join('\n\n')
}
