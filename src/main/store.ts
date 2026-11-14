import { DatabaseSync } from 'node:sqlite'

// The app's own saved state (jobs added in the app), in its own data folder.
// Never anything inside the job-search folder. Jobs are kept per workspace.

const MAX_JOB_BYTES = 2 * 1024 * 1024
const ID = /^[A-Za-z0-9_-]{1,64}$/

export class Store {
  private db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        workspace TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS jobs_by_workspace ON jobs (workspace, created_at);
      CREATE TABLE IF NOT EXISTS picks (
        workspace TEXT NOT NULL,
        key TEXT NOT NULL,
        state TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (workspace, key)
      );
    `)
  }

  /** "Add to board" / "Hide" decisions on ranked jobs, by the framework's job key. */
  listPicks(workspace: string): Record<string, 'board' | 'hidden' | 'cleared'> {
    const rows = this.db.prepare('SELECT key, state FROM picks WHERE workspace = ?').all(workspace) as {
      key: string
      state: string
    }[]
    const out: Record<string, 'board' | 'hidden' | 'cleared'> = {}
    for (const r of rows) if (r.state === 'board' || r.state === 'hidden' || r.state === 'cleared') out[r.key] = r.state
    return out
  }

  /** Sets or (with null) clears one decision. */
  setPick(workspace: string, key: unknown, state: unknown): boolean {
    if (typeof key !== 'string' || key.length === 0 || key.length > 300) return false
    if (state === null) {
      this.db.prepare('DELETE FROM picks WHERE workspace = ? AND key = ?').run(workspace, key)
      return true
    }
    if (state !== 'board' && state !== 'hidden' && state !== 'cleared') return false
    this.db
      .prepare(
        `INSERT INTO picks (workspace, key, state, at) VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace, key) DO UPDATE SET state = excluded.state, at = excluded.at`
      )
      .run(workspace, key, state, Date.now())
    return true
  }

  listJobs(workspace: string): unknown[] {
    const rows = this.db
      .prepare('SELECT data FROM jobs WHERE workspace = ? ORDER BY created_at DESC')
      .all(workspace) as { data: string }[]
    const out: unknown[] = []
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.data))
      } catch {
        // A damaged entry is skipped, never fatal.
      }
    }
    return out
  }

  /** Saves one job (insert or replace). Refuses bad ids and oversized data. */
  saveJob(workspace: string, job: unknown): boolean {
    if (typeof job !== 'object' || job === null) return false
    const id = (job as { id?: unknown }).id
    if (typeof id !== 'string' || !ID.test(id)) return false
    const data = JSON.stringify(job)
    if (data.length > MAX_JOB_BYTES) return false
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO jobs (id, workspace, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
         WHERE jobs.workspace = excluded.workspace`
      )
      .run(id, workspace, now, now, data)
    return true
  }

  deleteJob(workspace: string, id: unknown): boolean {
    if (typeof id !== 'string' || !ID.test(id)) return false
    return this.db.prepare('DELETE FROM jobs WHERE id = ? AND workspace = ?').run(id, workspace).changes > 0
  }

  close(): void {
    this.db.close()
  }
}
