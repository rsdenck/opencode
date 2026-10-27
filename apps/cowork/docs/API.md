# API

Base path: `/api`. Authentication: `x-cowork-token` header or
`Authorization: Bearer <token>`. Errors use the shape:

```json
{
  "error": { "code": "task_not_found", "message": "Task not found" }
}
```

## Endpoints

| Method | Path                                     | Description                                                   |
| ------ | ---------------------------------------- | ------------------------------------------------------------- |
| GET    | `/api/health`                            | Health, version, uptime, database state, OpenCode health      |
| GET    | `/api/system`                            | Version, uptime, OpenCode, settings, counts, limits, database |
| GET    | `/api/system/diagnostics`                | Adapter diagnostics                                           |
| GET    | `/api/catalog`                           | Providers, agents, skills, MCP servers, settings              |
| POST   | `/api/workspaces`                        | Register workspace (201; 409 if exists)                       |
| GET    | `/api/workspaces`                        | List workspaces                                               |
| DELETE | `/api/workspaces/:id`                    | Remove workspace                                              |
| GET    | `/api/workspaces/:id/files?path=&limit=` | Directory listing                                             |
| GET    | `/api/workspaces/:id/file?path=`         | Text file preview                                             |
| POST   | `/api/tasks`                             | Create task (202)                                             |
| GET    | `/api/tasks`                             | List tasks (paginated query)                                  |
| GET    | `/api/tasks/:id`                         | Task detail with steps/approvals/artifacts/events             |
| GET    | `/api/tasks/:id/events?limit=`           | Task event log                                                |
| GET    | `/api/tasks/:id/approvals`               | Task approvals                                                |
| GET    | `/api/tasks/:id/messages`                | OpenCode conversation messages                                |
| GET    | `/api/tasks/:id/artifacts`               | Task artifacts                                                |
| POST   | `/api/tasks/:id/cancel`                  | Cancel task                                                   |
| POST   | `/api/tasks/:id/resume`                  | Resume interrupted/failed task                                |
| POST   | `/api/approvals/:id/reply`               | Reply to pending approval                                     |
| GET    | `/api/settings`                          | Get settings                                                  |
| PATCH  | `/api/settings`                          | Update settings                                               |
| GET    | `/api/events?taskID=`                    | SSE stream (`ready`, `update`, `heartbeat`)                   |
| GET    | `/`                                      | Serve web UI (503 when not built)                             |
| GET    | `/index.html`                            | Serve web UI shell                                            |

## Task lifecycle state machine

Documented in [DECISIONS/0002-task-state-machine.md](DECISIONS/0002-task-state-machine.md).

## Error codes

- `unauthorized` (401), `origin_not_allowed` (403), `validation_error` (400),
  `not_found` (404), `task_not_found`, `workspace_not_found`, `task_already_finished`,
  `task_not_resumable`, `approval_not_pending`, `model_not_found`,
  `model_provider_not_found`, `agent_not_found`, `workspace_root_not_allowed`,
  `path_traversal`, `path_required`, `unsafe_binding`, `weak_token`,
  `database_unavailable`, `opencode_unavailable`, …

## SSE contract

`GET /api/events` hijacks the response and writes:

```
retry: 3000

event: ready
data: {"at":...}

event: update
data: {"kind":"task.updated","taskID":"...","task":{...}}

event: heartbeat
data: <epoch millis>
```

Clients may filter by `taskID`.

## Versioning

The Cowork API is versioned by contract only in this milestone; breaking changes
require a major version bump and a migration note in this document.
