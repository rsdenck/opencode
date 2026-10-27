export interface Migration {
  id: number
  name: string
  sql: string
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
        workspace_path TEXT NOT NULL,
        session_id TEXT,
        status TEXT NOT NULL,
        phase TEXT NOT NULL,
        model_provider TEXT,
        model_id TEXT,
        model_variant TEXT,
        agent TEXT NOT NULL,
        approval_mode TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        error TEXT,
        summary TEXT,
        plan_summary TEXT,
        cost REAL NOT NULL DEFAULT 0,
        tokens_json TEXT NOT NULL DEFAULT '{}',
        resumable INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);

      CREATE TABLE IF NOT EXISTS task_steps (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        phase TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT,
        ordinal INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_steps_task ON task_steps(task_id, ordinal);

      CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(task_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_events_task ON task_events(task_id, seq);

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL UNIQUE,
        action TEXT NOT NULL,
        resources_json TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        status TEXT NOT NULL,
        decision TEXT,
        message TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        change TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime INTEGER NOT NULL,
        UNIQUE(task_id, path)
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_task ON artifacts(task_id);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `,
  },
  {
    id: 2,
    name: "task_events_metadata",
    sql: `
      ALTER TABLE task_events ADD COLUMN metadata_json TEXT;
      ALTER TABLE task_events ADD COLUMN durable_seq INTEGER;
    `,
  },
  {
    id: 3,
    name: "approval_agent_and_source",
    sql: `
      ALTER TABLE approvals ADD COLUMN agent TEXT;
      ALTER TABLE approvals ADD COLUMN source_json TEXT;
    `,
  },
]
