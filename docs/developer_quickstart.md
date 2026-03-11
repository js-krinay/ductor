# Developer Quickstart

Fast onboarding path for contributors and junior devs.

## 1) Local setup

```bash
uv sync --group dev
```

Optional for full runtime validation:

- install/auth at least one provider CLI (`claude`, `codex`, `gemini`)
- create Telegram bot token + user ID (`allowed_user_ids`)
- for group support, also set `allowed_group_ids`

## 2) Run the bot

```bash
klir
```

First run starts onboarding and writes config to `~/.klir/config/config.json`.

Primary runtime files/directories:

- `~/.klir/sessions.json`
- `~/.klir/named_sessions.json`
- `~/.klir/tasks.json`
- `~/.klir/chat_activity.json`
- `~/.klir/cron_jobs.json`
- `~/.klir/webhooks.json`
- `~/.klir/startup_state.json`
- `~/.klir/inflight_turns.json`
- `~/.klir/SHAREDMEMORY.md`
- `~/.klir/agents.json`
- `~/.klir/agents/`
- `~/.klir/workspace/`
- `~/.klir/logs/agent.log`

## 3) Quality gates

```bash
uv run pytest
uv run ruff format .
uv run ruff check .
uv run mypy klir
```

Expected: zero warnings, zero errors.

## 4) Core mental model

```text
Telegram or API input
  -> ingress layer (bot middleware/handlers or ApiServer)
  -> orchestrator flow
  -> provider CLI subprocess
  -> response delivery

background/async results
  -> Envelope adapters
  -> MessageBus
  -> optional session injection
  -> TelegramTransport
```

## 5) Read order in code

Entry + command layer:

- `klir/__main__.py`
- `klir/cli_commands/`

Runtime hot path:

- `klir/multiagent/supervisor.py`
- `klir/bot/app.py`
- `klir/bot/startup.py`
- `klir/orchestrator/core.py`
- `klir/orchestrator/lifecycle.py`
- `klir/orchestrator/flows.py`

Delivery/task/session core:

- `klir/bus/`
- `klir/session/manager.py`
- `klir/tasks/hub.py`
- `klir/tasks/registry.py`

Provider/API/workspace core:

- `klir/cli/service.py` + provider wrappers
- `klir/api/server.py`
- `klir/workspace/init.py`
- `klir/workspace/rules_selector.py`
- `klir/workspace/skill_sync.py`

## 6) Common debug paths

If command behavior is wrong:

1. `klir/__main__.py`
2. `klir/cli_commands/*`

If Telegram routing is wrong:

1. `klir/bot/middleware.py`
2. `klir/bot/app.py`
3. `klir/orchestrator/commands.py`
4. `klir/orchestrator/flows.py`

If background results look wrong:

1. `klir/bus/adapters.py`
2. `klir/bus/bus.py`
3. `klir/bus/telegram_transport.py`

If tasks are wrong:

1. `klir/tasks/hub.py`
2. `klir/tasks/registry.py`
3. `klir/multiagent/internal_api.py`
4. `klir/_home_defaults/workspace/tools/task_tools/*.py`

If API is wrong:

1. `klir/api/server.py`
2. `klir/orchestrator/lifecycle.py` (API startup wiring)
3. `klir/files/*` (allowed roots, MIME, prompt building)

## 7) Behavior details to remember

- `/stop` and `/stop_all` are pre-routing abort paths in middleware/bot.
- `/new` resets only active provider bucket for the active `SessionKey`.
- session identity is topic-aware: `SessionKey(chat_id, topic_id)`.
- `/model` inside a topic updates only that topic session (not global config).
- task tools now support permanent single-task removal via `delete_task.py` (`/tasks/delete`).
- task routing is topic-aware via `thread_id` and `KLIR_TOPIC_ID`.
- API auth accepts optional `channel_id` for per-channel session isolation.
- startup recovery uses `inflight_turns.json` + recovered named sessions.
- auth allowlists (`allowed_user_ids`, `allowed_group_ids`) are hot-reloadable.

Continue with `docs/system_overview.md` and `docs/architecture.md` for complete runtime detail.
