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
    `)
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
