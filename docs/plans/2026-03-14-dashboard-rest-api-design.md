# Dashboard REST API Design (#32)

> Adds 13 REST endpoints to `ApiServer` for dashboard state hydration and actions.

## Architecture

MVC pattern with thin routes and a logic controller layer:

```
klir/api/
├── server.py          # Existing. Registers routes, owns bearer auth
├── dashboard.py       # Existing. DashboardHub + DTO serializers
├── routes.py          # NEW — Thin route layer (request parsing -> controller -> response)
└── controller.py      # NEW — Business logic (manager queries, SSE streaming)
```

### `controller.py` — DashboardController

Constructor takes each manager explicitly:

```python
class DashboardController:
    def __init__(
        self,
        session_mgr: SessionManager,
        named_registry: NamedSessionRegistry,
        cron_mgr: CronManager,
        task_registry_getter: Callable[[], TaskRegistry | None],
        process_registry: ProcessRegistry,
        message_handler: StreamingMessageHandler,
        abort_handler: AbortHandler,
        history_store: MessageHistory,
        dashboard_hub: DashboardHub,
        observer_status_getter: Callable[[], dict[str, Any]],
        config_summary_getter: Callable[[], dict[str, Any]],
        agent_health_getter: Callable[[], dict[str, Any]],
    ): ...
```

- Methods return plain dicts or async generators (for SSE). No aiohttp types.
- Reuses existing DTO serializers from `dashboard.py`.

### `routes.py` — Thin route layer

- One function per endpoint: parses request params, calls controller, returns `web.Response`.
- `register_dashboard_routes(app, controller, verify_bearer)` wires all routes into the aiohttp app.
- Bearer auth check delegated via the `verify_bearer` callable.

### Wiring in `ApiServer.start()`

If dashboard is enabled:
1. Construct `DashboardController` from existing `_snapshot_sources`, `_handle_message`, `_handle_abort`
2. Call `register_dashboard_routes(app, controller, self._verify_bearer)`
3. No changes to existing WebSocket or HTTP routes

## Endpoint Map

| Route | Controller Method | Data Source |
|---|---|---|
| `GET /api/sessions` | `list_sessions(chat_id?)` | `session_mgr.list_all()` |
| `GET /api/sessions/:chat_id/history` | `get_history(chat_id, topic_id?, limit, before?, origin?)` | `history_store.query()` |
| `GET /api/named-sessions` | `list_named_sessions(chat_id?, status?)` | `named_registry.list_all_active()` |
| `GET /api/agents` | `list_agents()` | `agent_health_getter()` |
| `GET /api/cron` | `list_cron_jobs()` | `cron_mgr.list_jobs()` |
| `GET /api/cron/:job_id/history` | `get_cron_history(job_id, limit)` | cron run log query |
| `PATCH /api/cron/:job_id` | `toggle_cron_job(job_id, enabled)` | `cron_mgr.update_job()` |
| `GET /api/tasks` | `list_tasks(status?, agent?)` | `task_registry.list_all()` |
| `POST /api/tasks/:task_id/cancel` | `cancel_task(task_id)` | task registry cancel |
| `GET /api/processes` | `list_processes()` | `process_registry.list_all_active()` |
| `POST /api/sessions/:chat_id/message` | `send_message(chat_id, text, topic_id?, stream?)` | `message_handler` |
| `GET /api/health` | `get_health()` | aggregates multiple sources |
| `POST /api/abort` | `abort_chat(chat_id)` | `abort_handler` |

All endpoints require `Authorization: Bearer <token>`. Response schemas match `docs/dashboard-api-spec.md`.

## SSE Streaming

For `POST /api/sessions/:chat_id/message?stream=true`:

- Route layer creates `web.StreamResponse` with `Content-Type: text/event-stream`
- Controller returns an async generator yielding SSE-formatted strings
- Internally uses an `asyncio.Queue` fed by callbacks (same `on_text_delta`/`on_tool_activity`/`on_system_status` pattern as WebSocket streaming)
- Generator reads from queue, yields `event: <type>\ndata: <json>\n\n` lines
- For `stream=false`, controller awaits result and returns a plain dict

## Testing

Unit tests in `tests/api/test_controller.py`:
- Mock all managers, call controller methods directly
- Verify return shapes match spec schemas
- Test filtering (chat_id, status, agent params)
- Test SSE generator yields correct event format
- Test error cases (missing job_id, invalid task_id)
