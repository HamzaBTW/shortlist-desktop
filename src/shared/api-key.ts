// The "Anthropic API key" engine, as the screens see it. The key itself never comes back to the
// screens: only whether one is saved, its last 4 characters and what it has spent so far.

export interface KeyInfo {
  saved: boolean
  /** Last 4 characters, to tell keys apart. null when none is saved. */
  last4: string | null
  /** When the key was added (ISO date), null when none is saved. */
  addedAt: string | null
  /** What runs on this key have cost since it was added, as reported by each finished run. */
  spentUsd: number
  /**
   * 'ok': the system keeps the key encrypted (Windows, macOS, Linux with a keyring).
   * 'weak': Linux without a keyring, where saving would be close to plain text; the app refuses.
   */
  storage: 'ok' | 'weak'
}

export const NO_KEY: KeyInfo = { saved: false, last4: null, addedAt: null, spentUsd: 0, storage: 'ok' }

export type SaveKeyResult =
  | { ok: true; info: KeyInfo }
  | { ok: false; reason: 'format' | 'invalid' | 'offline' | 'storage' | 'failed' }

/** Anthropic API keys look like `sk-ant-api03-...`; anything else is refused before any request. */
export function isKeyFormat(raw: unknown): raw is string {
  return typeof raw === 'string' && /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(raw)
}

/** A run's reported cost added to the total; anything that is not a sane number is ignored. */
export function addSpend(total: number, cost: unknown): number {
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || cost > 1000) return total
  return Math.round((total + cost) * 1_000_000) / 1_000_000
}

/** Whether the engine that runs on Claude Code ("Your Claude Code") is offered at all. */
export const ENGINE_ONE_ENABLED = true
