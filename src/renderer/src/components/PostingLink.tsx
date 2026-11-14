import type { ReactNode } from 'react'

/** A web link that opens in the person's own browser (the window itself never navigates). */
export function PostingLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      className={className ?? 'sl-link'}
      onClick={(e) => {
        e.preventDefault()
        void window.shortlist.openLink(href)
      }}
    >
      {children}
    </a>
  )
}
