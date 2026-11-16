import Anthropic from '@anthropic-ai/sdk'
import { app, safeStorage, session, type Session } from 'electron'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { addSpend, isKeyFormat, NO_KEY, type KeyInfo, type SaveKeyResult } from '../../shared/api-key'

// Engine 2, "Anthropic API key". The key is encrypted with the system's own store (safeStorage:
// DPAPI on Windows, Keychain on macOS, the keyring on Linux) and kept in the app's data folder.
// It is decrypted only here, in the main process, right before a run, and never sent to the
// screens. Linux without a keyring would store it close to plain text, so the app refuses.

interface Stored {
  /** safeStorage-encrypted key, base64. */
  enc: string
  last4: string
  addedAt: string
  spentUsd: number
}

const file = (): string => path.join(app.getPath('userData'), 'api-key.json')

function storage(): KeyInfo['storage'] {
  if (!safeStorage.isEncryptionAvailable()) return 'weak'
  if (process.platform === 'linux') {
    const backend = safeStorage.getSelectedStorageBackend()
    if (backend === 'basic_text' || backend === 'unknown') return 'weak'
  }
  return 'ok'
}

function load(): Stored | null {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<Stored>
    if (typeof raw.enc !== 'string' || typeof raw.last4 !== 'string' || typeof raw.addedAt !== 'string') return null
    return { enc: raw.enc, last4: raw.last4, addedAt: raw.addedAt, spentUsd: typeof raw.spentUsd === 'number' ? addSpend(0, raw.spentUsd) : 0 }
  } catch {
    return null
  }
}

function save(stored: Stored): void {
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(stored, null, 2), { mode: 0o600 })
  renameSync(tmp, file())
}

export function keyInfo(): KeyInfo {
  const s = load()
  const st = storage()
  return s ? { saved: true, last4: s.last4, addedAt: s.addedAt, spentUsd: s.spentUsd, storage: st } : { ...NO_KEY, storage: st }
}

/** The key, for a run. Main process only; null when none is saved or it can't be decrypted. */
export function readKey(): string | null {
  const s = load()
  if (!s || storage() !== 'ok') return null
  try {
    const key = safeStorage.decryptString(Buffer.from(s.enc, 'base64'))
    return isKeyFormat(key) ? key : null
  } catch {
    return null
  }
}

/** Adds a finished run's reported cost to the total shown in Settings. */
export function recordSpend(cost: unknown): void {
  const s = load()
  if (!s) return
  const next = addSpend(s.spentUsd, cost)
  if (next !== s.spentUsd) save({ ...s, spentUsd: next })
}

export function removeKey(): KeyInfo {
  rmSync(file(), { force: true })
  rmSync(`${file()}.tmp`, { force: true })
  return keyInfo()
}

const MODELS_URL = 'https://api.anthropic.com/v1/models'
let checkSession: Session | null = null

/** A session for the key check only: no cache on disk, no permissions, one address. */
function keySession(): Session {
  if (checkSession) return checkSession
  const s = session.fromPartition('shortlist-key-check', { cache: false })
  s.setPermissionRequestHandler((_c, _p, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    cb({ cancel: !(details.url === MODELS_URL || details.url.startsWith(`${MODELS_URL}?`)) })
  })
  checkSession = s
  return s
}

/**
 * Checks the key with Anthropic's model list (free: it runs no model), then saves it encrypted.
 * The request goes through its own locked session, with the address and credentials set here so
 * nothing in the person's environment (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN) is picked up.
 */
export async function saveKey(raw: unknown): Promise<SaveKeyResult> {
  const key = typeof raw === 'string' ? raw.trim() : raw
  if (!isKeyFormat(key)) return { ok: false, reason: 'format' }
  if (storage() !== 'ok') return { ok: false, reason: 'storage' }

  const s = keySession()
  const client = new Anthropic({
    apiKey: key,
    authToken: null,
    baseURL: 'https://api.anthropic.com',
    maxRetries: 0,
    timeout: 15_000,
    fetch: (url, init) => s.fetch(String(url), { ...(init as RequestInit), credentials: 'omit', redirect: 'error' })
  })
  try {
    await client.models.list({ limit: 1 })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return { ok: false, reason: 'invalid' }
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: 'offline' }
    if (!app.isPackaged) console.log(`[key check] failed: ${err instanceof Anthropic.APIError ? err.status : (err as Error).name}`)
    return { ok: false, reason: 'failed' }
  }

  try {
    save({ enc: safeStorage.encryptString(key).toString('base64'), last4: key.slice(-4), addedAt: new Date().toISOString().slice(0, 10), spentUsd: 0 })
  } catch {
    return { ok: false, reason: 'failed' }
  }
  return { ok: true, info: keyInfo() }
}
