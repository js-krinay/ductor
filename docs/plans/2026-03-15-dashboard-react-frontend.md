# Dashboard React Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a React SPA dashboard for klir's Mission Control, served from `ApiServer` as static files, with real-time WebSocket state, 8 views, and streaming message display.

**Architecture:** Vite + React 18 + TypeScript SPA inside `klir/dashboard/`. Zustand store hydrated from WebSocket snapshot, updated by real-time events. REST API for on-demand queries (history, cron runs). SSE stream parsing for message sending. shadcn/ui components with dark theme. Production build served by `ApiServer` at `/dashboard/`.

**Tech Stack:** React 18, TypeScript, Vite, React Router, Zustand, shadcn/ui (Tailwind + Radix), react-markdown

**Design doc:** `docs/plans/2026-03-15-dashboard-react-frontend-design.md`

---

## Task 1: Backend — API Always Enabled

Make the API server start automatically with the bot (no `klir api enable` needed).

**Files:**
- Modify: `klir/config.py:207` — Change `enabled` default to `True`
- Modify: `klir/cli/init_wizard.py:302-337` — Auto-generate API token during `_write_config()`
- Modify: `klir/cli/init_wizard.py:372-385` — Show API token in "Ready" panel
- Modify: `klir/cli_commands/api_cmd.py:18` — Add `"token"` to `_API_SUBCOMMANDS`
- Modify: `klir/cli_commands/api_cmd.py:175-188` — Add `api_token()` and dispatch entry

**Step 1: Change API default to enabled**

In `klir/config.py`, `ApiConfig` class (line 207):

```python
enabled: bool = True  # was: False
```

**Step 2: Auto-generate token in onboarding**

In `klir/cli/init_wizard.py`, modify `_write_config()` to generate an API token:

```python
def _write_config(
    *,
    telegram_token: str,
    allowed_user_ids: list[int],
    user_timezone: str,
) -> Path:
    """Write the config file with wizard values merged into defaults."""
    import secrets as _secrets

    paths = resolve_paths()
    config_path = paths.config_path
    config_path.parent.mkdir(parents=True, exist_ok=True)

    if config_path.exists():
        try:
            existing: dict[str, object] = json.loads(config_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            logger.warning("Ignoring invalid config file during onboarding: %s", config_path)
            existing = {}
    else:
        existing = {}

    defaults = AgentConfig().model_dump(mode="json")
    defaults["gemini_api_key"] = DEFAULT_EMPTY_GEMINI_API_KEY
    merged, _ = deep_merge_config(existing, defaults)
    if merged.get("gemini_api_key") is None:
        merged["gemini_api_key"] = DEFAULT_EMPTY_GEMINI_API_KEY

    merged["telegram_token"] = telegram_token
    merged["allowed_user_ids"] = allowed_user_ids
    merged["user_timezone"] = user_timezone

    # Ensure API token exists
    api = merged.get("api", {})
    if isinstance(api, dict) and not api.get("token"):
        api["token"] = _secrets.token_urlsafe(32)
        merged["api"] = api

    from klir.infra.json_store import atomic_json_save

    atomic_json_save(config_path, merged)

    init_workspace(paths)
    return config_path
```

**Step 3: Show API token in Ready panel**

In `run_onboarding()`, modify the "Ready" panel (line 372-385) to include the API token:

```python
    # Read back the API token for display
    try:
        final_config = json.loads(config_path.read_text(encoding="utf-8"))
        api_token = final_config.get("api", {}).get("token", "")
    except (json.JSONDecodeError, OSError):
        api_token = ""

    api_token_line = f"  API Token:  [cyan]{api_token}[/cyan]\n" if api_token else ""

    console.print(
        Panel(
            "[bold green]Setup complete![/bold green]\n\n"
            "[bold]Your klir files:[/bold]\n\n"
            f"  Home:       [cyan]{paths.klir_home}[/cyan]\n"
            f"  Config:     [cyan]{config_path}[/cyan]\n"
            f"  Workspace:  [cyan]{paths.workspace}[/cyan]\n"
            f"  Logs:       [cyan]{paths.logs_dir}[/cyan]\n\n"
            "[bold]Dashboard:[/bold]\n\n"
            f"  URL:        [cyan]http://localhost:8741/dashboard/[/cyan]\n"
            + api_token_line
            + "\n"
            + ("Installing service..." if run_as_service else "Starting bot..."),
            title="[bold green]Ready[/bold green]",
            border_style="green",
            padding=(1, 2),
        ),
    )
```

**Step 4: Add `klir api token` command**

In `klir/cli_commands/api_cmd.py`:

```python
_API_SUBCOMMANDS = frozenset({"enable", "disable", "token"})
```

Add the function:

```python
def api_token() -> None:
    """Display the current API token."""
    result = _read_config()
    if result is None:
        return
    _config_path, data = result

    api = data.get("api", {})
    if not isinstance(api, dict):
        api = {}
    token = api.get("token", "")
    if not token:
        _console.print("[dim]No API token configured. Run [bold]klir[/bold] to set up.[/dim]")
        return
    port = api.get("port", 8741)
    _console.print(
        Panel(
            f"  Token:  [cyan]{token}[/cyan]\n"
            f"  URL:    [cyan]http://localhost:{port}/dashboard/[/cyan]",
            title="[bold]API Access[/bold]",
            border_style="blue",
            padding=(1, 2),
        ),
    )
```

Update the dispatch dict:

```python
dispatch: dict[str, Callable[[], None]] = {
    "enable": api_enable,
    "disable": api_disable,
    "token": api_token,
}
```

**Step 5: Run tests**

Run: `uv run pytest tests/ -x -q`
Expected: All existing tests pass (no behavior changes for existing users with `api.enabled=true` already set)

**Step 6: Commit**

```bash
git add klir/config.py klir/cli/init_wizard.py klir/cli_commands/api_cmd.py
git commit -m "feat: Enable API server by default and show token in onboarding"
```

---

## Task 2: Backend — Static File Serving for Dashboard

Add static file serving for the dashboard SPA from `ApiServer`.

**Files:**
- Modify: `klir/api/server.py:286-322` — Add static file routes and SPA fallback
- Modify: `pyproject.toml:79-92` — Include `dashboard/dist/` in wheel
- Test: `tests/api/test_server_static.py` (create)

**Step 1: Write the failing test**

Create `tests/api/test_server_static.py`:

```python
"""Tests for dashboard static file serving."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp import web
from aiohttp.test_utils import AioHTTPTestCase, TestClient

from klir.api.server import ApiServer


@pytest.fixture
def dashboard_dist(tmp_path: Path) -> Path:
    """Create a fake dashboard dist directory."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!DOCTYPE html><html><body>Dashboard</body></html>")
    assets = dist / "assets"
    assets.mkdir()
    (assets / "main.js").write_text("console.log('dashboard')")
    return dist


@pytest.fixture
def api_config():
    cfg = MagicMock()
    cfg.token = "test-token"
    cfg.host = "127.0.0.1"
    cfg.port = 0  # random port
    cfg.allow_public = True
    cfg.dashboard.enabled = True
    cfg.dashboard.max_clients = 5
    return cfg


class TestDashboardStaticServing:
    async def test_serves_index_html(self, aiohttp_client, api_config, dashboard_dist):
        server = ApiServer(api_config, default_chat_id=1)
        app = server._build_app(dashboard_dist=dashboard_dist)
        client = await aiohttp_client(app)

        resp = await client.get("/dashboard/")
        assert resp.status == 200
        text = await resp.text()
        assert "Dashboard" in text

    async def test_spa_fallback_returns_index(self, aiohttp_client, api_config, dashboard_dist):
        server = ApiServer(api_config, default_chat_id=1)
        app = server._build_app(dashboard_dist=dashboard_dist)
        client = await aiohttp_client(app)

        resp = await client.get("/dashboard/sessions")
        assert resp.status == 200
        text = await resp.text()
        assert "Dashboard" in text

    async def test_serves_assets(self, aiohttp_client, api_config, dashboard_dist):
        server = ApiServer(api_config, default_chat_id=1)
        app = server._build_app(dashboard_dist=dashboard_dist)
        client = await aiohttp_client(app)

        resp = await client.get("/dashboard/assets/main.js")
        assert resp.status == 200
        text = await resp.text()
        assert "console.log" in text

    async def test_no_dist_skips_static(self, aiohttp_client, api_config, tmp_path):
        server = ApiServer(api_config, default_chat_id=1)
        app = server._build_app(dashboard_dist=tmp_path / "nonexistent")
        client = await aiohttp_client(app)

        resp = await client.get("/dashboard/")
        assert resp.status == 404
```

**Step 2: Run test to verify it fails**

Run: `uv run pytest tests/api/test_server_static.py -v`
Expected: FAIL — `_build_app` method doesn't exist yet

**Step 3: Implement static file serving**

In `klir/api/server.py`, add a method to resolve the dashboard dist path and register routes.

Add near the top of the file (imports):

```python
from pathlib import Path
```

Add method to `ApiServer`:

```python
def _resolve_dashboard_dist(self) -> Path | None:
    """Return dashboard dist dir if it exists."""
    dist = Path(__file__).resolve().parent.parent / "dashboard" / "dist"
    if dist.is_dir() and (dist / "index.html").exists():
        return dist
    return None
```

In the `start()` method, after dashboard REST routes are registered (after line 322), add:

```python
# Dashboard SPA static files
dashboard_dist = self._resolve_dashboard_dist()
if dashboard_dist is not None:
    index_html = dashboard_dist / "index.html"
    index_bytes = index_html.read_bytes()

    async def _dashboard_spa_fallback(request: web.Request) -> web.Response:
        """SPA catch-all: serve index.html for client-side routing."""
        # Try to serve static file first
        rel = request.match_info.get("path", "")
        static_file = dashboard_dist / rel
        if rel and static_file.is_file() and static_file.resolve().is_relative_to(dashboard_dist):
            return web.FileResponse(static_file)
        return web.Response(body=index_bytes, content_type="text/html")

    app.router.add_get("/dashboard/{path:.*}", _dashboard_spa_fallback)
    app.router.add_get("/dashboard/", _dashboard_spa_fallback)
    app.router.add_get("/dashboard", _dashboard_spa_fallback)
    logger.info("Dashboard SPA serving from %s", dashboard_dist)
```

**Step 4: Update pyproject.toml for packaging**

In `pyproject.toml`, the `klir/dashboard/dist/` is already inside the `klir/` package directory, so hatch will include it automatically since `packages = ["klir"]` includes everything under `klir/`. No changes needed unless we need to exclude source files.

Add to the sdist includes:

```toml
[tool.hatch.build.targets.sdist]
include = [
    "klir/",
    "config.example.json",
    "LICENSE",
    "README.md",
    "pyproject.toml",
]
exclude = [
    "klir/dashboard/node_modules/",
    "klir/dashboard/src/",
    "klir/dashboard/*.json",
    "klir/dashboard/*.ts",
    "klir/dashboard/*.html",
]
```

**Step 5: Run tests**

Run: `uv run pytest tests/api/test_server_static.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add klir/api/server.py pyproject.toml tests/api/test_server_static.py
git commit -m "feat: Serve dashboard SPA as static files from ApiServer"
```

---

## Task 3: Frontend — Project Scaffold

Initialize the Vite + React + TypeScript project inside `klir/dashboard/`.

**Files:**
- Create: `klir/dashboard/package.json`
- Create: `klir/dashboard/tsconfig.json`
- Create: `klir/dashboard/tsconfig.app.json`
- Create: `klir/dashboard/vite.config.ts`
- Create: `klir/dashboard/index.html`
- Create: `klir/dashboard/postcss.config.js`
- Create: `klir/dashboard/src/main.tsx`
- Create: `klir/dashboard/src/App.tsx`
- Create: `klir/dashboard/src/index.css`
- Modify: `.gitignore` — Add `klir/dashboard/node_modules/`, `klir/dashboard/dist/`

**Step 1: Initialize project**

```bash
cd klir/dashboard
npm create vite@latest . -- --template react-ts
```

If it asks to overwrite, confirm.

**Step 2: Install dependencies**

```bash
cd klir/dashboard
npm install react-router-dom zustand react-markdown
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Initialize shadcn/ui**

```bash
cd klir/dashboard
npx shadcn@latest init -d
```

Select: New York style, Zinc base color, CSS variables.

**Step 4: Add shadcn components**

```bash
cd klir/dashboard
npx shadcn@latest add badge button card input label separator switch table tabs toast
```

**Step 5: Configure Vite**

Create `klir/dashboard/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/dashboard/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8741",
      "/ws": {
        target: "ws://localhost:8741",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

Key: `base: "/dashboard/"` ensures all asset paths are prefixed correctly when served from `ApiServer`.

**Step 6: Set up index.html**

Create `klir/dashboard/index.html`:

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>klir — Mission Control</title>
  </head>
  <body class="min-h-screen bg-background text-foreground antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: Set up entry point**

Create `klir/dashboard/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename="/dashboard">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

Create `klir/dashboard/src/App.tsx`:

```tsx
import { Routes, Route, Navigate } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<div>Overview placeholder</div>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

**Step 8: Update .gitignore**

Add to root `.gitignore`:

```
klir/dashboard/node_modules/
klir/dashboard/dist/
```

**Step 9: Verify dev server starts**

```bash
cd klir/dashboard && npm run dev
```

Expected: Vite dev server starts, accessible at `http://localhost:5173/dashboard/`

**Step 10: Verify production build**

```bash
cd klir/dashboard && npm run build
```

Expected: `dist/` directory created with `index.html` and `assets/` folder

**Step 11: Commit**

```bash
git add klir/dashboard/ .gitignore
git commit -m "feat(dashboard): Scaffold React + Vite + shadcn/ui project"
```

---

## Task 4: TypeScript Types

Define TypeScript interfaces matching all backend DTOs exactly.

**Files:**
- Create: `klir/dashboard/src/types/api.ts`

**Step 1: Create types file**

Reference: `klir/api/dashboard.py` lines 188-295 for DTO shapes, `docs/dashboard-api-spec.md` for event schemas.

```typescript
// klir/dashboard/src/types/api.ts

// --- DTOs (match backend dashboard.py *_to_dto functions) ---

export interface SessionDTO {
  chat_id: number;
  topic_id: number | null;
  user_id: number | null;
  topic_name: string | null;
  provider: string;
  model: string;
  session_id: string;
  message_count: number;
  total_cost_usd: number;
  total_tokens: number;
  created_at: number;
  last_active: number;
  thinking_level: string | null;
}

export interface NamedSessionDTO {
  name: string;
  chat_id: number;
  provider: string;
  model: string;
  session_id: string;
  prompt_preview: string;
  status: string;
  created_at: number;
  message_count: number;
}

export interface AgentHealthDTO {
  name: string;
  status: string;
  uptime_seconds: number;
  restart_count: number;
  last_crash_time: number | null;
  last_crash_error: string | null;
}

export interface CronJobDTO {
  id: string;
  title: string;
  schedule: string;
  enabled: boolean;
  consecutive_errors: number;
  last_error: string | null;
  last_duration_ms: number | null;
  provider: string;
  model: string;
}

export interface CronRunEntry {
  ts: number;
  job_id: string;
  status: string;
  duration_ms: number;
  delivery_status: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  summary: string;
  error: string | null;
}

export interface TaskDTO {
  task_id: string;
  chat_id: number;
  parent_agent: string;
  name: string;
  prompt_preview: string;
  provider: string;
  model: string;
  status: string;
  created_at: number;
  completed_at: number | null;
  elapsed_seconds: number;
  error: string | null;
  num_turns: number;
  question_count: number;
  last_question: string | null;
}

export interface ProcessDTO {
  chat_id: number;
  label: string;
  pid: number;
  registered_at: number;
}

export interface MessageEntry {
  id: string;
  ts: number;
  origin: string;
  chat_id: number;
  topic_id: number | null;
  direction: "inbound" | "outbound";
  text: string;
  provider: string;
  model: string;
  session_id: string;
  session_name: string;
  cost_usd: number;
  tokens: number;
  elapsed_seconds: number;
  is_error: boolean;
  metadata: Record<string, unknown>;
}

// --- Snapshot ---

export interface Snapshot {
  sessions: SessionDTO[];
  named_sessions: NamedSessionDTO[];
  agents: AgentHealthDTO[];
  cron_jobs: CronJobDTO[];
  tasks: TaskDTO[];
  processes: ProcessDTO[];
  observers: Record<string, unknown>;
  config: Record<string, unknown>;
}

// --- WebSocket messages ---

export interface WsAuthMessage {
  type: "auth";
  token: string;
}

export interface WsAuthOk {
  type: "auth_ok";
}

export interface WsSnapshot {
  type: "snapshot";
  ts: number;
  data: Snapshot;
}

export interface WsEvent {
  type: "event";
  event: string;
  ts: number;
  data: Record<string, unknown>;
}

export interface WsPong {
  type: "pong";
  ts: number;
}

export interface WsError {
  type: "error";
  message: string;
}

export type WsServerMessage = WsAuthOk | WsSnapshot | WsEvent | WsPong | WsError;

// --- SSE events ---

export interface SseTextDelta {
  event: "text_delta";
  text: string;
}

export interface SseToolActivity {
  event: "tool_activity";
  tool: string;
}

export interface SseSystemStatus {
  event: "system_status";
  label: string;
}

export interface SseResult {
  event: "result";
  text: string;
  cost_usd: number;
  tokens: number;
  elapsed_seconds: number;
}

export type SseEvent = SseTextDelta | SseToolActivity | SseSystemStatus | SseResult;

// --- REST responses ---

export interface HealthResponse {
  status: string;
  connections: { api_clients: number; dashboard_clients: number };
  observers: Record<string, boolean>;
}

export interface HistoryResponse {
  messages: MessageEntry[];
  has_more: boolean;
  next_cursor: number | null;
}
```

**Step 2: Verify types compile**

```bash
cd klir/dashboard && npx tsc --noEmit
```

Expected: No errors

**Step 3: Commit**

```bash
git add klir/dashboard/src/types/api.ts
git commit -m "feat(dashboard): Add TypeScript types matching backend DTOs"
```

---

## Task 5: Auth Store & Login Page

Implement token authentication with localStorage persistence.

**Files:**
- Create: `klir/dashboard/src/store/auth.ts`
- Create: `klir/dashboard/src/api/client.ts`
- Create: `klir/dashboard/src/views/Login.tsx`
- Modify: `klir/dashboard/src/App.tsx`

**Step 1: Create auth store**

```typescript
// klir/dashboard/src/store/auth.ts
import { create } from "zustand";

const TOKEN_KEY = "klir_api_token";

interface AuthState {
  token: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  setToken: (token) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ token });
  },
  clearToken: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null });
  },
}));
```

**Step 2: Create REST client**

```typescript
// klir/dashboard/src/api/client.ts
import { useAuthStore } from "@/store/auth";
import type { HealthResponse, HistoryResponse, CronRunEntry } from "@/types/api";

const BASE = import.meta.env.DEV ? "" : "";

function headers(): HeadersInit {
  const token = useAuthStore.getState().token;
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() });
  if (res.status === 401) {
    useAuthStore.getState().clearToken();
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function validateToken(): Promise<boolean> {
  try {
    await apiFetch<HealthResponse>("/api/health");
    return true;
  } catch {
    return false;
  }
}

export async function fetchHistory(
  chatId: number,
  opts?: { topicId?: number; limit?: number; before?: number; origin?: string },
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  if (opts?.topicId != null) params.set("topic_id", String(opts.topicId));
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.before != null) params.set("before", String(opts.before));
  if (opts?.origin) params.set("origin", opts.origin);
  const qs = params.toString();
  return apiFetch<HistoryResponse>(`/api/sessions/${chatId}/history${qs ? `?${qs}` : ""}`);
}

export async function fetchCronHistory(jobId: string, limit = 20): Promise<{ runs: CronRunEntry[] }> {
  return apiFetch(`/api/cron/${encodeURIComponent(jobId)}/history?limit=${limit}`);
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<void> {
  await apiFetch(`/api/cron/${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function cancelTask(taskId: string): Promise<void> {
  await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" });
}

export async function abortChat(chatId: number): Promise<void> {
  await apiFetch("/api/abort", {
    method: "POST",
    body: JSON.stringify({ chat_id: chatId }),
  });
}
```

**Step 3: Create Login page**

```tsx
// klir/dashboard/src/views/Login.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth";
import { validateToken } from "@/api/client";

export default function Login() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const storeToken = useAuthStore((s) => s.setToken);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Temporarily set token for validation
    storeToken(token.trim());
    const valid = await validateToken();
    setLoading(false);

    if (valid) {
      navigate("/", { replace: true });
    } else {
      useAuthStore.getState().clearToken();
      setError("Invalid token");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl">klir</CardTitle>
          <p className="text-center text-sm text-muted-foreground">Mission Control</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">API Token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your API token"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Found in your klir config or shown during setup
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || !token.trim()}>
              {loading ? "Connecting..." : "Connect"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 4: Wire up App.tsx with auth routing**

```tsx
// klir/dashboard/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import Login from "@/views/Login";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <div>Dashboard placeholder — authenticated</div>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
```

**Step 5: Verify login flow works**

```bash
cd klir/dashboard && npm run dev
```

Navigate to `http://localhost:5173/dashboard/` — should redirect to login.

**Step 6: Commit**

```bash
git add klir/dashboard/src/store/auth.ts klir/dashboard/src/api/client.ts klir/dashboard/src/views/Login.tsx klir/dashboard/src/App.tsx
git commit -m "feat(dashboard): Add auth store, REST client, and login page"
```

---

## Task 6: WebSocket Connection & Dashboard Store

Implement the WebSocket connection manager and Zustand dashboard store with event reducer.

**Files:**
- Create: `klir/dashboard/src/api/ws.ts`
- Create: `klir/dashboard/src/store/dashboard.ts`

**Step 1: Create dashboard store**

```typescript
// klir/dashboard/src/store/dashboard.ts
import { create } from "zustand";
import type {
  SessionDTO,
  NamedSessionDTO,
  AgentHealthDTO,
  CronJobDTO,
  TaskDTO,
  ProcessDTO,
  Snapshot,
} from "@/types/api";

interface DashboardState {
  sessions: SessionDTO[];
  namedSessions: NamedSessionDTO[];
  agents: AgentHealthDTO[];
  cronJobs: CronJobDTO[];
  tasks: TaskDTO[];
  processes: ProcessDTO[];
  observers: Record<string, unknown>;
  config: Record<string, unknown>;
  connected: boolean;
  lastSnapshotAt: number | null;

  setConnected: (v: boolean) => void;
  applySnapshot: (data: Snapshot) => void;
  applyEvent: (event: string, data: Record<string, unknown>) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  sessions: [],
  namedSessions: [],
  agents: [],
  cronJobs: [],
  tasks: [],
  processes: [],
  observers: {},
  config: {},
  connected: false,
  lastSnapshotAt: null,

  setConnected: (v) => set({ connected: v }),

  applySnapshot: (data) =>
    set({
      sessions: data.sessions,
      namedSessions: data.named_sessions,
      agents: data.agents,
      cronJobs: data.cron_jobs,
      tasks: data.tasks,
      processes: data.processes,
      observers: data.observers,
      config: data.config,
      lastSnapshotAt: Date.now(),
    }),

  applyEvent: (event, data) =>
    set((state) => {
      switch (event) {
        case "session.created":
          return { sessions: [...state.sessions, data as unknown as SessionDTO] };
        case "session.updated":
          return {
            sessions: state.sessions.map((s) =>
              s.chat_id === (data as unknown as SessionDTO).chat_id
                ? { ...s, ...(data as unknown as SessionDTO) }
                : s,
            ),
          };
        case "session.reset":
          return {
            sessions: state.sessions.filter(
              (s) => s.chat_id !== (data as { chat_id: number }).chat_id,
            ),
          };
        case "named_session.created":
          return {
            namedSessions: [...state.namedSessions, data as unknown as NamedSessionDTO],
          };
        case "named_session.updated":
          return {
            namedSessions: state.namedSessions.map((ns) =>
              ns.name === (data as unknown as NamedSessionDTO).name
                ? { ...ns, ...(data as unknown as NamedSessionDTO) }
                : ns,
            ),
          };
        case "named_session.ended":
          return {
            namedSessions: state.namedSessions.map((ns) =>
              ns.name === (data as { name: string }).name
                ? { ...ns, status: "ended" }
                : ns,
            ),
          };
        case "agent.health":
          return {
            agents: upsertBy(state.agents, data as unknown as AgentHealthDTO, "name"),
          };
        case "cron.fired":
        case "cron.updated":
          return {
            cronJobs: state.cronJobs.map((j) =>
              j.id === (data as { id: string }).id ? { ...j, ...data } as CronJobDTO : j,
            ),
          };
        case "task.created":
          return { tasks: [...state.tasks, data as unknown as TaskDTO] };
        case "task.updated":
          return {
            tasks: state.tasks.map((t) =>
              t.task_id === (data as unknown as TaskDTO).task_id
                ? { ...t, ...(data as unknown as TaskDTO) }
                : t,
            ),
          };
        case "process.started":
          return { processes: [...state.processes, data as unknown as ProcessDTO] };
        case "process.ended":
          return {
            processes: state.processes.filter(
              (p) => p.pid !== (data as { pid: number }).pid,
            ),
          };
        default:
          return {};
      }
    }),
}));

function upsertBy<T>(arr: T[], item: T, key: keyof T): T[] {
  const idx = arr.findIndex((x) => x[key] === item[key]);
  if (idx === -1) return [...arr, item];
  const copy = [...arr];
  copy[idx] = { ...copy[idx], ...item };
  return copy;
}
```

**Step 2: Create WebSocket connection manager**

```typescript
// klir/dashboard/src/api/ws.ts
import { useAuthStore } from "@/store/auth";
import { useDashboardStore } from "@/store/dashboard";
import type { WsServerMessage } from "@/types/api";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 30_000;
const PING_INTERVAL = 25_000;
let pingTimer: ReturnType<typeof setInterval> | null = null;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws/dashboard`;
}

export function connect(): void {
  const token = useAuthStore.getState().token;
  if (!token || ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(wsUrl());

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: "auth", token }));
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as WsServerMessage;
    const store = useDashboardStore.getState();

    switch (msg.type) {
      case "auth_ok":
        reconnectDelay = 1000;
        store.setConnected(true);
        startPing();
        break;
      case "snapshot":
        store.applySnapshot(msg.data);
        break;
      case "event":
        store.applyEvent(msg.event, msg.data);
        break;
      case "error":
        if (msg.message?.includes("auth")) {
          useAuthStore.getState().clearToken();
        }
        break;
      case "pong":
        break;
    }
  };

  ws.onclose = () => {
    useDashboardStore.getState().setConnected(false);
    stopPing();
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnect(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  stopPing();
  ws?.close();
  ws = null;
}

function scheduleReconnect(): void {
  if (!useAuthStore.getState().token) return;
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    connect();
  }, reconnectDelay);
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  }, PING_INTERVAL);
}

function stopPing(): void {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}
```

**Step 3: Verify types compile**

```bash
cd klir/dashboard && npx tsc --noEmit
```

Expected: No errors

**Step 4: Commit**

```bash
git add klir/dashboard/src/store/dashboard.ts klir/dashboard/src/api/ws.ts
git commit -m "feat(dashboard): Add Zustand store with event reducer and WebSocket manager"
```

---

## Task 7: Layout Shell & Navigation

Build the sidebar layout with navigation and connection status.

**Files:**
- Create: `klir/dashboard/src/components/Layout.tsx`
- Create: `klir/dashboard/src/components/ConnectionBanner.tsx`
- Modify: `klir/dashboard/src/App.tsx` — Wire layout + all routes

**Step 1: Create Layout component**

```tsx
// klir/dashboard/src/components/Layout.tsx
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useDashboardStore } from "@/store/dashboard";
import { useAuthStore } from "@/store/auth";
import ConnectionBanner from "@/components/ConnectionBanner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: "◉" },
  { to: "/sessions", label: "Sessions", icon: "◎" },
  { to: "/named-sessions", label: "Named", icon: "◈" },
  { to: "/agents", label: "Agents", icon: "◆" },
  { to: "/cron", label: "Cron", icon: "◷" },
  { to: "/tasks", label: "Tasks", icon: "◧" },
  { to: "/processes", label: "Processes", icon: "◫" },
] as const;

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const connected = useDashboardStore((s) => s.connected);
  const clearToken = useAuthStore((s) => s.clearToken);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col border-r bg-card transition-all",
          collapsed ? "w-14" : "w-48",
        )}
      >
        <div className="flex items-center gap-2 border-b px-3 py-3">
          {!collapsed && <span className="text-sm font-bold">klir</span>}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "→" : "←"}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
                )
              }
            >
              <span className="w-5 text-center">{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-green-500" : "bg-red-500",
              )}
            />
            {!collapsed && (
              <span className="text-xs text-muted-foreground">
                {connected ? "Connected" : "Disconnected"}
              </span>
            )}
          </div>
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full text-xs"
              onClick={clearToken}
            >
              Logout
            </Button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <ConnectionBanner />
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

**Step 2: Create ConnectionBanner**

```tsx
// klir/dashboard/src/components/ConnectionBanner.tsx
import { useDashboardStore } from "@/store/dashboard";

export default function ConnectionBanner() {
  const connected = useDashboardStore((s) => s.connected);

  if (connected) return null;

  return (
    <div className="bg-destructive/15 px-4 py-2 text-center text-sm text-destructive">
      Disconnected — reconnecting...
    </div>
  );
}
```

**Step 3: Update App.tsx with full routing**

```tsx
// klir/dashboard/src/App.tsx
import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import { connect, disconnect } from "@/api/ws";
import Login from "@/views/Login";
import Layout from "@/components/Layout";
import Overview from "@/views/Overview";
import Sessions from "@/views/Sessions";
import MessageThread from "@/views/MessageThread";
import NamedSessions from "@/views/NamedSessions";
import Agents from "@/views/Agents";
import Cron from "@/views/Cron";
import Tasks from "@/views/Tasks";
import Processes from "@/views/Processes";

function AuthenticatedApp() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) connect();
    return () => disconnect();
  }, [token]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="sessions/:chatId" element={<MessageThread />} />
        <Route path="named-sessions" element={<NamedSessions />} />
        <Route path="agents" element={<Agents />} />
        <Route path="cron" element={<Cron />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="processes" element={<Processes />} />
      </Route>
    </Routes>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AuthenticatedApp />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
```

**Step 4: Create placeholder views**

Create each view file as a minimal placeholder (they'll be implemented in subsequent tasks):

```tsx
// klir/dashboard/src/views/Overview.tsx
export default function Overview() {
  return <h1 className="text-2xl font-bold">Overview</h1>;
}
```

Same pattern for: `Sessions.tsx`, `MessageThread.tsx`, `NamedSessions.tsx`, `Agents.tsx`, `Cron.tsx`, `Tasks.tsx`, `Processes.tsx`.

**Step 5: Verify navigation works**

```bash
cd klir/dashboard && npm run dev
```

Expected: Sidebar navigation renders, clicking items changes routes.

**Step 6: Commit**

```bash
git add klir/dashboard/src/
git commit -m "feat(dashboard): Add layout shell with sidebar navigation and route wiring"
```

---

## Task 8: Overview View

**Files:**
- Modify: `klir/dashboard/src/views/Overview.tsx`

**Step 1: Implement Overview**

```tsx
// klir/dashboard/src/views/Overview.tsx
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";

export default function Overview() {
  const sessions = useDashboardStore((s) => s.sessions);
  const namedSessions = useDashboardStore((s) => s.namedSessions);
  const agents = useDashboardStore((s) => s.agents);
  const cronJobs = useDashboardStore((s) => s.cronJobs);
  const tasks = useDashboardStore((s) => s.tasks);
  const processes = useDashboardStore((s) => s.processes);
  const observers = useDashboardStore((s) => s.observers);
  const config = useDashboardStore((s) => s.config);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mission Control</h1>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link to="/sessions">
          <StatCard title="Active Sessions" value={sessions.length} />
        </Link>
        <Link to="/named-sessions">
          <StatCard
            title="Named Sessions"
            value={namedSessions.filter((ns) => ns.status !== "ended").length}
          />
        </Link>
        <Link to="/tasks">
          <StatCard
            title="Running Tasks"
            value={tasks.filter((t) => t.status === "running").length}
          />
        </Link>
        <Link to="/processes">
          <StatCard title="Active Processes" value={processes.length} />
        </Link>
      </div>

      {/* Observers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Observers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(observers).map(([name, status]) => (
              <Badge
                key={name}
                variant={status ? "default" : "secondary"}
                className="text-xs"
              >
                {name}: {status ? "running" : "stopped"}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agents */}
      {agents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {agents.map((a) => (
                <Badge
                  key={a.name}
                  variant={a.status === "running" ? "default" : "destructive"}
                >
                  {a.name}: {a.status}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Config summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {Object.entries(config).map(([key, value]) => (
              <span key={key}>
                {key}: <span className="text-foreground">{String(value)}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Verify**

```bash
cd klir/dashboard && npm run dev
```

Navigate to `/dashboard/` — should show stat cards and sections.

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Overview.tsx
git commit -m "feat(dashboard): Implement Overview view with stat cards"
```

---

## Task 9: Sessions View

**Files:**
- Modify: `klir/dashboard/src/views/Sessions.tsx`
- Create: `klir/dashboard/src/lib/format.ts` (shared formatters)

**Step 1: Create formatters**

```typescript
// klir/dashboard/src/lib/format.ts
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
```

**Step 2: Implement Sessions view**

```tsx
// klir/dashboard/src/views/Sessions.tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";
import { formatCost, formatTokens, formatRelativeTime } from "@/lib/format";

type SortKey = "last_active" | "total_cost_usd" | "total_tokens" | "message_count";

export default function Sessions() {
  const sessions = useDashboardStore((s) => s.sessions);
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>("last_active");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [sessions, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No active sessions
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sessions</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Chat</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Topic</TableHead>
            <TableHead className="cursor-pointer" onClick={() => toggleSort("message_count")}>
              Messages
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => toggleSort("total_cost_usd")}>
              Cost
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => toggleSort("total_tokens")}>
              Tokens
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => toggleSort("last_active")}>
              Last Active
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((s) => (
            <TableRow
              key={s.chat_id}
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => navigate(`/sessions/${s.chat_id}`)}
            >
              <TableCell className="font-mono text-sm">{s.chat_id}</TableCell>
              <TableCell>
                <Badge variant="outline">{s.provider}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{s.model}</TableCell>
              <TableCell>{s.topic_name ?? "—"}</TableCell>
              <TableCell>{s.message_count}</TableCell>
              <TableCell>{formatCost(s.total_cost_usd)}</TableCell>
              <TableCell>{formatTokens(s.total_tokens)}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatRelativeTime(s.last_active)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add klir/dashboard/src/views/Sessions.tsx klir/dashboard/src/lib/format.ts
git commit -m "feat(dashboard): Implement Sessions view with sortable table"
```

---

## Task 10: Message Thread View with SSE Streaming

**Files:**
- Create: `klir/dashboard/src/api/sse.ts`
- Modify: `klir/dashboard/src/views/MessageThread.tsx`

**Step 1: Create SSE stream parser**

```typescript
// klir/dashboard/src/api/sse.ts
import { useAuthStore } from "@/store/auth";

export interface StreamCallbacks {
  onTextDelta: (text: string) => void;
  onToolActivity: (tool: string) => void;
  onSystemStatus: (label: string) => void;
  onResult: (data: { text: string; cost_usd: number; tokens: number; elapsed_seconds: number }) => void;
  onError: (err: string) => void;
}

export async function sendMessageStream(
  chatId: number,
  text: string,
  callbacks: StreamCallbacks,
  topicId?: number,
): Promise<void> {
  const token = useAuthStore.getState().token;
  const res = await fetch(`/api/sessions/${chatId}/message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, topic_id: topicId ?? null, stream: true }),
  });

  if (res.status === 401) {
    useAuthStore.getState().clearToken();
    callbacks.onError("Unauthorized");
    return;
  }
  if (!res.ok) {
    callbacks.onError(`Error: ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ") && currentEvent) {
          const data = JSON.parse(line.slice(6));
          switch (currentEvent) {
            case "text_delta":
              callbacks.onTextDelta(data.text);
              break;
            case "tool_activity":
              callbacks.onToolActivity(data.tool);
              break;
            case "system_status":
              callbacks.onSystemStatus(data.label);
              break;
            case "result":
              callbacks.onResult(data);
              break;
          }
          currentEvent = "";
        }
      }
    }
  } catch {
    callbacks.onError("Stream interrupted");
  }
}
```

**Step 2: Implement MessageThread view**

```tsx
// klir/dashboard/src/views/MessageThread.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchHistory } from "@/api/client";
import { sendMessageStream } from "@/api/sse";
import type { MessageEntry } from "@/types/api";
import { formatRelativeTime, formatCost } from "@/lib/format";

export default function MessageThread() {
  const { chatId } = useParams<{ chatId: string }>();
  const chatIdNum = Number(chatId);
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchHistory(chatIdNum, { limit: 50 })
      .then((res) => {
        setMessages(res.messages.reverse());
        setHasMore(res.has_more);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chatIdNum]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamText, scrollToBottom]);

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const text = input.trim();
    setInput("");

    // Add user message
    const userMsg: MessageEntry = {
      id: `temp-${Date.now()}`,
      ts: Date.now() / 1000,
      origin: "DASHBOARD",
      chat_id: chatIdNum,
      topic_id: null,
      direction: "inbound",
      text,
      provider: "",
      model: "",
      session_id: "",
      session_name: "",
      cost_usd: 0,
      tokens: 0,
      elapsed_seconds: 0,
      is_error: false,
      metadata: {},
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamText("");
    setToolActivity(null);

    await sendMessageStream(chatIdNum, text, {
      onTextDelta: (delta) => setStreamText((prev) => prev + delta),
      onToolActivity: (tool) => setToolActivity(tool),
      onSystemStatus: () => {},
      onResult: (result) => {
        const responseMsg: MessageEntry = {
          id: `temp-resp-${Date.now()}`,
          ts: Date.now() / 1000,
          origin: "DASHBOARD",
          chat_id: chatIdNum,
          topic_id: null,
          direction: "outbound",
          text: result.text,
          provider: "",
          model: "",
          session_id: "",
          session_name: "",
          cost_usd: result.cost_usd,
          tokens: result.tokens,
          elapsed_seconds: result.elapsed_seconds,
          is_error: false,
          metadata: {},
        };
        setMessages((prev) => [...prev, responseMsg]);
        setStreamText("");
        setToolActivity(null);
        setStreaming(false);
      },
      onError: (err) => {
        setStreamText((prev) => prev + `\n\n_${err}_`);
        setStreaming(false);
      },
    });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <h1 className="mb-4 text-2xl font-bold">Chat {chatId}</h1>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-auto pb-4">
        {messages.length === 0 && !streaming && (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            No messages yet
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming response */}
        {streaming && streamText && (
          <div className="rounded-lg bg-card p-4">
            <ReactMarkdown className="prose prose-invert max-w-none text-sm">
              {streamText}
            </ReactMarkdown>
            {toolActivity && (
              <Badge variant="secondary" className="mt-2 text-xs">
                Using: {toolActivity}
              </Badge>
            )}
          </div>
        )}

        {streaming && !streamText && (
          <div className="rounded-lg bg-card p-4 text-sm text-muted-foreground animate-pulse">
            Thinking...
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex gap-2 border-t pt-4"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          disabled={streaming}
          autoFocus
        />
        <Button type="submit" disabled={streaming || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageEntry }) {
  const isOutbound = message.direction === "outbound";

  return (
    <div className={`rounded-lg p-4 ${isOutbound ? "bg-card" : "bg-accent/30"}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{isOutbound ? "Assistant" : "You"}</span>
        <span>{formatRelativeTime(message.ts)}</span>
        {isOutbound && message.cost_usd > 0 && <span>{formatCost(message.cost_usd)}</span>}
      </div>
      {isOutbound ? (
        <ReactMarkdown className="prose prose-invert max-w-none text-sm">
          {message.text}
        </ReactMarkdown>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
      )}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add klir/dashboard/src/api/sse.ts klir/dashboard/src/views/MessageThread.tsx
git commit -m "feat(dashboard): Implement MessageThread view with SSE streaming"
```

---

## Task 11: Named Sessions View

**Files:**
- Modify: `klir/dashboard/src/views/NamedSessions.tsx`

**Step 1: Implement**

```tsx
// klir/dashboard/src/views/NamedSessions.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";

const STATUSES = ["all", "running", "idle", "ended"] as const;

export default function NamedSessions() {
  const namedSessions = useDashboardStore((s) => s.namedSessions);
  const [filter, setFilter] = useState<string>("all");

  const filtered =
    filter === "all" ? namedSessions : namedSessions.filter((ns) => ns.status === filter);

  if (namedSessions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No named sessions
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Named Sessions</h1>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ns) => (
          <Card key={ns.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{ns.name}</CardTitle>
                <StatusBadge status={ns.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{ns.provider}</Badge>
                <span className="text-muted-foreground">{ns.model}</span>
              </div>
              <p className="text-muted-foreground line-clamp-2">{ns.prompt_preview}</p>
              <p className="text-xs text-muted-foreground">{ns.message_count} messages</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "running" ? "default" : status === "ended" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}
```

**Step 2: Commit**

```bash
git add klir/dashboard/src/views/NamedSessions.tsx
git commit -m "feat(dashboard): Implement Named Sessions view with status filter"
```

---

## Task 12: Agents View

**Files:**
- Modify: `klir/dashboard/src/views/Agents.tsx`

**Step 1: Implement**

```tsx
// klir/dashboard/src/views/Agents.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/store/dashboard";
import { formatDuration } from "@/lib/format";

export default function Agents() {
  const agents = useDashboardStore((s) => s.agents);

  if (agents.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No agents configured
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Agents</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((a) => (
          <Card key={a.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{a.name}</CardTitle>
                <Badge variant={a.status === "running" ? "default" : "destructive"}>
                  {a.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span>{formatDuration(a.uptime_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Restarts</span>
                <span>{a.restart_count}</span>
              </div>
              {a.last_crash_error && (
                <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                  {a.last_crash_error}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add klir/dashboard/src/views/Agents.tsx
git commit -m "feat(dashboard): Implement Agents view with health cards"
```

---

## Task 13: Cron View with Run History

**Files:**
- Modify: `klir/dashboard/src/views/Cron.tsx`

**Step 1: Implement**

```tsx
// klir/dashboard/src/views/Cron.tsx
import { useState } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useDashboardStore } from "@/store/dashboard";
import { toggleCronJob, fetchCronHistory } from "@/api/client";
import type { CronRunEntry } from "@/types/api";
import { formatDuration, formatRelativeTime } from "@/lib/format";

export default function Cron() {
  const cronJobs = useDashboardStore((s) => s.cronJobs);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<CronRunEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function handleToggle(jobId: string, enabled: boolean) {
    try {
      await toggleCronJob(jobId, enabled);
    } catch {
      // Toast would go here
    }
  }

  async function handleExpand(jobId: string) {
    if (expandedId === jobId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(jobId);
    setLoadingHistory(true);
    try {
      const res = await fetchCronHistory(jobId);
      setRunHistory(res.runs);
    } catch {
      setRunHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  if (cronJobs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No cron jobs configured
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cron Jobs</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Enabled</TableHead>
            <TableHead>Last Duration</TableHead>
            <TableHead>Errors</TableHead>
            <TableHead>Provider</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cronJobs.map((job) => (
            <>
              <TableRow
                key={job.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => handleExpand(job.id)}
              >
                <TableCell className="font-medium">{job.title}</TableCell>
                <TableCell className="font-mono text-sm">{job.schedule}</TableCell>
                <TableCell>
                  <Switch
                    checked={job.enabled}
                    onCheckedChange={(v) => handleToggle(job.id, v)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell>
                  {job.last_duration_ms != null
                    ? formatDuration(job.last_duration_ms / 1000)
                    : "—"}
                </TableCell>
                <TableCell>
                  {job.consecutive_errors > 0 ? (
                    <Badge variant="destructive">{job.consecutive_errors}</Badge>
                  ) : (
                    "0"
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{job.provider}</Badge>
                </TableCell>
              </TableRow>

              {/* Expanded run history */}
              {expandedId === job.id && (
                <TableRow key={`${job.id}-history`}>
                  <TableCell colSpan={6} className="bg-accent/20 p-4">
                    {loadingHistory ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    ) : runHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No run history</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Summary</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runHistory.map((run) => (
                            <TableRow key={run.ts}>
                              <TableCell className="text-sm">
                                {formatRelativeTime(run.ts)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={run.status === "success" ? "default" : "destructive"}
                                >
                                  {run.status}
                                </Badge>
                              </TableCell>
                              <TableCell>{formatDuration(run.duration_ms / 1000)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {run.error ?? run.summary}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add klir/dashboard/src/views/Cron.tsx
git commit -m "feat(dashboard): Implement Cron view with toggle and run history"
```

---

## Task 14: Tasks View

**Files:**
- Modify: `klir/dashboard/src/views/Tasks.tsx`

**Step 1: Implement**

```tsx
// klir/dashboard/src/views/Tasks.tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";
import { cancelTask } from "@/api/client";
import { formatDuration } from "@/lib/format";

export default function Tasks() {
  const tasks = useDashboardStore((s) => s.tasks);

  async function handleCancel(taskId: string) {
    try {
      await cancelTask(taskId);
    } catch {
      // Toast would go here
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No tasks
      </div>
    );
  }

  const statusVariant = (s: string) =>
    s === "running" ? "default" : s === "done" ? "secondary" : "destructive";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Elapsed</TableHead>
            <TableHead>Prompt</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.task_id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>{t.parent_agent}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{t.provider}</Badge>
              </TableCell>
              <TableCell>{formatDuration(t.elapsed_seconds)}</TableCell>
              <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                {t.prompt_preview}
              </TableCell>
              <TableCell>
                {t.status === "running" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleCancel(t.task_id)}
                  >
                    Cancel
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add klir/dashboard/src/views/Tasks.tsx
git commit -m "feat(dashboard): Implement Tasks view with cancel action"
```

---

## Task 15: Processes View

**Files:**
- Modify: `klir/dashboard/src/views/Processes.tsx`

**Step 1: Implement**

```tsx
// klir/dashboard/src/views/Processes.tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useDashboardStore } from "@/store/dashboard";
import { abortChat } from "@/api/client";
import { formatRelativeTime } from "@/lib/format";

export default function Processes() {
  const processes = useDashboardStore((s) => s.processes);

  async function handleAbort(chatId: number) {
    try {
      await abortChat(chatId);
    } catch {
      // Toast would go here
    }
  }

  if (processes.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No active processes
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Processes</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PID</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Chat</TableHead>
            <TableHead>Started</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {processes.map((p) => (
            <TableRow key={p.pid}>
              <TableCell className="font-mono">{p.pid}</TableCell>
              <TableCell>{p.label}</TableCell>
              <TableCell className="font-mono text-sm">{p.chat_id}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatRelativeTime(p.registered_at)}
              </TableCell>
              <TableCell>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleAbort(p.chat_id)}
                >
                  Abort
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add klir/dashboard/src/views/Processes.tsx
git commit -m "feat(dashboard): Implement Processes view with abort action"
```

---

## Task 16: Build Verification & Integration Test

Verify the full build pipeline works end-to-end.

**Files:**
- Verify: `klir/dashboard/dist/` after build
- Verify: Python test suite still passes
- Verify: Dashboard accessible via ApiServer

**Step 1: Production build**

```bash
cd klir/dashboard && npm run build
```

Expected: `dist/` created with `index.html` and `assets/` containing JS and CSS bundles.

**Step 2: Verify static serving works**

Start klir and verify `http://localhost:8741/dashboard/` loads the SPA.

**Step 3: Run Python test suite**

```bash
uv run pytest tests/ -x -q
```

Expected: All existing tests pass.

**Step 4: Verify TypeScript types are clean**

```bash
cd klir/dashboard && npx tsc --noEmit
```

Expected: No errors.

**Step 5: Run linter**

```bash
cd klir/dashboard && npx eslint src/
```

Expected: Clean or only warnings.

**Step 6: Final commit**

If any fixes were needed:

```bash
git add -A
git commit -m "fix(dashboard): Build and integration fixes"
```

---

## Summary

| Task | What | Backend/Frontend |
|------|------|-----------------|
| 1 | API always enabled + token in onboarding + `klir api token` | Backend |
| 2 | Static file serving for dashboard SPA | Backend |
| 3 | Vite + React + shadcn/ui scaffold | Frontend |
| 4 | TypeScript types matching backend DTOs | Frontend |
| 5 | Auth store + REST client + Login page | Frontend |
| 6 | WebSocket manager + Zustand dashboard store | Frontend |
| 7 | Layout shell + sidebar + routing | Frontend |
| 8 | Overview view | Frontend |
| 9 | Sessions view (sortable table) | Frontend |
| 10 | Message Thread view (SSE streaming) | Frontend |
| 11 | Named Sessions view | Frontend |
| 12 | Agents view | Frontend |
| 13 | Cron view (toggle + run history) | Frontend |
| 14 | Tasks view (cancel action) | Frontend |
| 15 | Processes view (abort action) | Frontend |
| 16 | Build verification & integration | Both |
