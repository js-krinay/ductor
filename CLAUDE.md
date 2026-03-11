This file gives coding agents a current map of the repository.

## Project Overview

klir is a Telegram bot that routes chat input to official provider CLIs (`claude`, `codex`, `gemini`), streams responses back to Telegram, persists per-chat state, and runs cron/webhook/heartbeat automation in-process.

Stack:

- Python 3.11+
- aiogram 3.x
- Pydantic 2.x
- asyncio

## Development Commands

```bash
# Setup
uv sync --group dev

# Run
uv run klir
uv run klir -v

# Tests
uv run pytest
uv run pytest tests/bot/test_app.py
uv run pytest -k "pattern"

# Quality
uv run ruff format .
uv run ruff check .
uv run mypy klir
```

## Runtime Flow

```text
Telegram Update
  -> AuthMiddleware
  -> SequentialMiddleware (queue + per-chat lock)
  -> TelegramBot handlers
  -> Orchestrator
  -> CLIService
  -> provider subprocess (claude/codex/gemini)
  -> Telegram output (stream edit or one-shot)
```

## Module Map

| Module | Purpose |
|---|---|
| `bot/` | Telegram handlers, callback routing, streaming delivery, queue UX |
| `orchestrator/` | command registry, directives/hooks, flow routing, observer wiring |
| `cli/` | provider wrappers, stream parsing, auth checks, process registry, model caches |
| `session/` | chat sessions with provider-isolated buckets |
| `background/` | named background sessions (`/session`) with follow-ups |
| `cron/` | in-process scheduler and one-shot task execution |
| `webhook/` | HTTP hooks (`wake` and `cron_task`) |
| `heartbeat/` | periodic proactive checks in active sessions |
| `cleanup/` | daily retention cleanup |
| `workspace/` | home seeding, rules deployment/sync, skill sync |
| `multiagent/` | multi-agent supervisor, inter-agent bus, shared knowledge, health monitoring |
| `infra/` | PID lock, service backends, Docker manager, update/restart helpers |

## Key Runtime Patterns

- `KlirPaths` (`workspace/paths.py`) is the single source of truth for paths.
- Workspace init is zone-based:
  - Zone 2 overwrite: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, and framework cron/webhook tool scripts.
  - Zone 3 seed-once for user-owned files.
- Rules are selected from `RULES*.md` variants and deployed per authenticated provider.
- Rule sync updates existing `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` siblings recursively by mtime.
- Skill sync spans `~/.klir/workspace/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.gemini/skills`.
  - normal mode: links
  - Docker mode: managed copies (`.klir_managed` marker)
- Streaming fallback is automatic; `/stop` abort checks are enforced during event loop processing.
- Session state is provider-isolated; `/new` resets only the active provider bucket.

## Background Systems

All run as in-process asyncio tasks:

- `BackgroundObserver`
- `CronObserver`
- `HeartbeatObserver`
- `WebhookObserver`
- `CleanupObserver`
- `CodexCacheObserver`
- `GeminiCacheObserver`
- rule sync watcher
- skill sync watcher
- update observer (upgradeable installs)

Optional multi-agent system (when `agents.json` is present):

- `AgentSupervisor` (manages main + sub-agents with crash recovery)
- `InterAgentBus` (in-memory sync + async messaging)
- `InternalAgentAPI` (`127.0.0.1:8799`, bridges CLI tools to bus)
- `SharedKnowledgeSync` (`SHAREDMEMORY.md` -> all agents' `MAINMEMORY.md`)
- `FileWatcher` on `agents.json` (auto-detect add/remove/change)

## Service Backends

- Linux: systemd user service
- macOS: launchd Launch Agent
- Windows: Task Scheduler

`klir service logs` behavior:

- Linux: `journalctl --user -u klir -f`
- macOS/Windows: recent lines from `~/.klir/logs/agent.log` (fallback newest `*.log`)

## CLI Commands

| Command | Effect |
|---|---|
| `klir` | Start bot (runs onboarding if needed) |
| `klir stop` | Stop bot and Docker container |
| `klir restart` | Restart bot |
| `klir upgrade` | Stop, upgrade, restart |
| `klir docker rebuild` | Stop bot, remove container & image, rebuilt on next start |
| `klir docker enable` | Set `docker.enabled = true` |
| `klir docker disable` | Stop container, set `docker.enabled = false` |
| `klir service install` | Install as background service |
| `klir service [sub]` | Service management (status/stop/logs/...) |
| `klir agents` | List all sub-agents and their config |
| `klir agents add <name>` | Add a new sub-agent (interactive) |
| `klir agents remove <name>` | Remove a sub-agent |

## Data Files (`~/.klir`)

- `config/config.json`
- `.env` (external API secrets, injected into all CLI subprocesses)
- `sessions.json`
- `cron_jobs.json`
- `webhooks.json`
- `agents.json`
- `SHAREDMEMORY.md`
- `agents/<name>/` (sub-agent workspaces)
- `logs/agent.log`

## Conventions

- `asyncio_mode = "auto"` in tests
- line length 100
- mypy strict mode
- ruff with strict lint profile
- config deep-merge adds new defaults without dropping user keys
- supervisor restart code is `42`
