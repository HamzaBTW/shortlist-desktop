import { Fragment, type ReactNode } from 'react'

// A small, safe Markdown renderer for command output: headings, lists, quotes,
// tables, bold and code. Everything becomes React text; no HTML is ever injected,
// and links are shown as text, never made clickable.

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    out.push(tok.startsWith('**') ? <strong key={m.index}>{tok.slice(2, -2)}</strong> : <code key={m.index}>{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface ListLine {
  indent: number
  marker: string
  text: string
}

/** A list; deeper-indented lines become a nested list under the item above. */
function List({ items }: { items: ListLine[] }) {
  const base = items[0]?.indent ?? 0
  const top: { line: ListLine; children: ListLine[] }[] = []
  for (const it of items) {
    const parent = top[top.length - 1]
    if (it.indent > base && parent) parent.children.push(it)
    else top.push({ line: it, children: [] })
  }
  const first = top[0]?.line.marker ?? '-'
  const ordered = /^\d/.test(first)
  const children = top.map((n, j) => (
    <li key={j}>
      {inline(n.line.text)}
      {n.children.length > 0 && <List items={n.children} />}
    </li>
  ))
  return ordered ? <ol start={parseInt(first, 10)}>{children}</ol> : <ul>{children}</ul>
}

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim())

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!
    const key = `b${i}`

    if (!line.trim()) {
      i++
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1]!.length + 2, 6)
      const H = `h${level}` as 'h3' | 'h4' | 'h5' | 'h6'
      blocks.push(<H key={key}>{inline(heading[2]!)}</H>)
      i++
      continue
    }

    if (/^```/.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!)
      i++
      blocks.push(<pre key={key}>{body.join('\n')}</pre>)
      continue
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]!)) rows.push(cells(lines[i]!))
        i++
      }
      const [head, ...body] = rows
      blocks.push(
        <div key={key} className="md-table">
          <table>
            {head && (
              <thead>
                <tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    if (/^\s*>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]!)) body.push(lines[i++]!.replace(/^\s*>\s?/, ''))
      blocks.push(<blockquote key={key}>{inline(body.join(' '))}</blockquote>)
      continue
    }

    const bullet = /^\s*([-*•]|\d+[.)])\s+/
    if (bullet.test(line)) {
      const items: ListLine[] = []
      while (i < lines.length && bullet.test(lines[i]!)) {
        const l = lines[i++]!
        items.push({ indent: l.length - l.trimStart().length, marker: /^\s*(\S+)/.exec(l)![1]!, text: l.replace(bullet, '') })
      }
      blocks.push(<List key={key} items={items} />)
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|```|\s*\||\s*>|\s*([-*•]|\d+[.)])\s)/.test(lines[i]!)) {
      para.push(lines[i++]!)
    }
    if (para.length === 0) para.push(lines[i++]!)
    blocks.push(
      <p key={key}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p)}
          </Fragment>
        ))}
      </p>
    )
  }

  return <div className="md">{blocks}</div>
}
