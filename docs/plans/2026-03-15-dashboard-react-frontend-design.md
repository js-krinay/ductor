# Dashboard React Frontend Design

Issue: #33

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Location | `klir/dashboard/` | Ships with Python package via `pyproject.toml` package-data |
| UI framework | shadcn/ui (Tailwind + Radix) | Polished, accessible, no runtime dep, fits data-dense views |
| Routing | React Router | URL-addressable views, browser history support |
| State management | Zustand | Clean selectors, no provider nesting, good for frequent WS updates |
| Streaming UX | Inline delta rendering | Mirrors Telegram bot UX, shows tool activity as status chips |
| E2E encryption | Skip for v1 | Bearer auth over HTTPS sufficient; add later without rework |
| Theme | Dark only | "Mission Control" aesthetic; light toggle easy to add later |
| Auth UX | Token login page | Single input, validate against `GET /api/health`, store in localStorage |

## Architecture

```
klir/dashboard/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/
│   │   ├── client.ts          # REST client (fetch + Bearer auth)
│   │   ├── ws.ts              # WebSocket connection manager
│   │   └── sse.ts             # SSE stream parser for message sending
│   ├── store/
│   │   ├── dashboard.ts       # Zustand store (snapshot + event reducer)
│   │   └── auth.ts            # Auth store (token in localStorage)
│   ├── types/
│   │   └── api.ts             # TypeScript types matching backend DTOs
│   ├── views/
│   │   ├── Overview.tsx
│   │   ├── Sessions.tsx
│   │   ├── MessageThread.tsx
│   │   ├── NamedSessions.tsx
│   │   ├── Agents.tsx
│   │   ├── Cron.tsx
│   │   ├── Tasks.tsx
│   │   └── Processes.tsx
│   ├── components/            # Shared UI (StatusBadge, DataTable, etc.)
│   └── lib/                   # Utilities (formatters, time helpers)
└── dist/                      # Production build output
```

Stack: React 18 + TypeScript, Vite, React Router, Zustand, shadcn/ui, dark theme only.

## Data Flow

### Connection lifecycle

```
Login -> store token in localStorage
      -> connect WebSocket to /ws/dashboard
      -> send {"type": "auth", "token": "<token>"}
      -> receive {"type": "auth_ok"}
      -> receive {"type": "snapshot", "data": {...}}
      -> Zustand store hydrated with snapshot
      -> listen for {"type": "event", ...} -> reducer updates store
```

### Zustand store shape

```typescript
interface DashboardState {
  sessions: SessionDTO[]
  namedSessions: NamedSessionDTO[]
  agents: AgentHealthDTO[]
  cronJobs: CronJobDTO[]
  tasks: TaskDTO[]
  processes: ProcessDTO[]
  observers: Record<string, string>
  config: Record<string, unknown>

  connected: boolean
  lastSnapshotAt: number | null

  applySnapshot: (data: Snapshot) => void
  applyEvent: (event: string, data: unknown) => void
}
```

### Event reducer

- `session.created` -> append to `sessions`
- `session.updated` -> merge into matching session by `chat_id`
- `session.reset` -> remove from `sessions` by `chat_id`
- `named_session.created/updated/ended` -> upsert/update in `namedSessions`
- `agent.health` -> upsert in `agents` by `name`
- `cron.fired/updated` -> update matching job in `cronJobs`
- `task.created/updated` -> upsert in `tasks` by `task_id`
- `process.started` -> append to `processes`
- `process.ended` -> remove from `processes` by `pid`

### REST calls (on-demand, not in store)

- Message history: `GET /api/sessions/{chat_id}/history` — local state in MessageThread
- Cron run history: `GET /api/cron/{job_id}/history` — local state in expandable row
- Send message: `POST /api/sessions/{chat_id}/message` with SSE stream parsing

### Reconnection

Auto-reconnect on disconnect with exponential backoff (1s -> 2s -> 4s -> max 30s). On reconnect, re-auth and get fresh snapshot replacing all store state.

## Views & Routes

| Route | View | Data source |
|---|---|---|
| `/` | Overview | Store (all slices) |
| `/sessions` | Sessions | Store `sessions` |
| `/sessions/:chatId` | Message Thread | Store + REST history |
| `/named-sessions` | Named Sessions | Store `namedSessions` |
| `/agents` | Agents | Store `agents` |
| `/cron` | Cron | Store `cronJobs` + REST history |
| `/tasks` | Tasks | Store `tasks` |
| `/processes` | Processes | Store `processes` |
| `/login` | Login | Auth store only |

### Layout

Fixed sidebar (collapsible to icons) + main content area. Connection status indicator (green/red dot) at sidebar bottom.

### View details

1. **Overview** — Stat card grid: active sessions, observer statuses (green/yellow/red badges), provider auth, uptime. Links to detail views.

2. **Sessions** — Sortable data table: chat_id, provider, model, topic, messages, cost, tokens, last active. Click row navigates to message thread.

3. **Message Thread** — Chat bubble layout with markdown rendering. Loads history via REST on mount. Input box to send messages. Streaming responses render deltas inline; tool activity shown as status chips below growing message.

4. **Named Sessions** — Cards or table: name, status badge, provider, prompt preview, message count. Filterable by status.

5. **Agents** — Health card grid: name, status badge, uptime, restart count, last crash error (expandable).

6. **Cron** — Table: title, schedule, enabled toggle, last run status, errors, provider. Expandable row loads run history via REST. Toggle calls `PATCH /api/cron/{job_id}`.

7. **Tasks** — Table: name, agent, status badge, provider, elapsed, prompt preview. Cancel button on running tasks calls `POST /api/tasks/{task_id}/cancel`.

8. **Processes** — Table: PID, label, chat_id, provider, registered time. Abort button calls `POST /api/abort`.

## Backend Changes

### API always enabled

- Remove `klir api enable` gate; ApiServer starts automatically with bot
- Auto-generate `api.token` on first run if not present
- Show token during `klir setup` onboarding
- Add `klir api token` CLI command to display current token

### Static file serving

- Serve `klir/dashboard/dist/` at `/dashboard/`
- Catch-all `/dashboard/*` returns `index.html` (SPA fallback)
- Only register if `dist/` exists (graceful skip during dev)
- No CORS needed (same-origin)

## Error Handling

- **WS disconnect**: Top banner "Disconnected — reconnecting..." with auto-reconnect. Store state stays visible (stale). Sidebar indicator turns red.
- **Auth failure**: 401 on REST or WS auth rejection clears token, redirects to `/login`. Login shows inline "Invalid token" error.
- **REST errors**: Toast notifications for action failures. No auto-retry.
- **Empty states**: Centered message per view ("No active sessions", etc.).
- **SSE stream error**: Inline error in message bubble ("Stream interrupted"), stop streaming indicator.
