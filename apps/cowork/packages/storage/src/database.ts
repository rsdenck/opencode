import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { CoworkError } from "@cowork/core"
import { MIGRATIONS } from "./migrations.js"

export type SqlValue = string | number | bigint | null | Uint8Array

function ensureParentDirectory(file: string): void {
  if (file === ":memory:") return
  mkdirSync(dirname(file), { recursive: true })
}

/**
 * Thin wrapper around Node's built-in SQLite driver. Node 22 exposes
 * `node:sqlite` as an experimental module; the application pins a minimum Node
 * version and tests the driver in CI. See docs/DECISIONS/0002-sqlite.md.
 */
export class Database {
  readonly raw: DatabaseSync
  readonly file: string

  constructor(file: string) {
    this.file = file
    ensureParentDirectory(file)
    this.raw = new DatabaseSync(file)
    this.raw.exec("PRAGMA journal_mode = WAL")
    this.raw.exec("PRAGMA foreign_keys = ON")
    this.raw.exec("PRAGMA busy_timeout = 5000")
    this.migrate()
  }

  migrate(): void {
    this.raw.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `)

    const applied = new Set(
      this.raw
        .prepare("SELECT id FROM schema_migrations")
        .all()
        .map((row) => Number((row as { id: number }).id)),
    )

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.id)) continue
      this.raw.exec("BEGIN IMMEDIATE")
      try {
        this.raw.exec(migration.sql)
        this.raw
          .prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)")
          .run(migration.id, migration.name, Date.now())
        this.raw.exec("COMMIT")
      } catch (error) {
        this.raw.exec("ROLLBACK")
        throw new CoworkError(
          "migration_failed",
          `Database migration ${migration.id} (${migration.name}) failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { status: 500 },
        )
      }
    }
  }

  close(): void {
    this.raw.close()
  }

  transaction<T>(fn: () => T): T {
    this.raw.exec("BEGIN IMMEDIATE")
    try {
      const result = fn()
      this.raw.exec("COMMIT")
      return result
    } catch (error) {
      this.raw.exec("ROLLBACK")
      throw error
    }
  }

  get schemaVersion(): number {
    const row = this.raw.prepare("SELECT MAX(id) AS version FROM schema_migrations").get() as
      | { version: number | null }
      | undefined
    return Number(row?.version ?? 0)
  }
}
