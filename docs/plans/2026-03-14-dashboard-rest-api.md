# Dashboard REST API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 13 REST endpoints to the existing `ApiServer` for dashboard state hydration and actions, using an MVC architecture with a thin route layer and a logic controller.

**Architecture:** New `klir/api/controller.py` (business logic, no aiohttp types) and `klir/api/routes.py` (thin request parsing + response formatting). Controller takes each manager explicitly. Routes delegate bearer auth via a callable. Dashboard routes are always registered (no `enabled` flag check). SSE streaming for message send reuses the existing orchestrator callback pattern via `asyncio.Queue`.

**Tech Stack:** Python 3.11+, aiohttp 3.x, asyncio, existing klir managers (SessionManager, CronManager, TaskRegistry, ProcessRegistry, NamedSessionRegistry, MessageHistory, DashboardHub)

**Design doc:** `docs/plans/2026-03-14-dashboard-rest-api-design.md`
**Full API spec:** `docs/dashboard-api-spec.md`

---

### Task 1: Controller — read-only list endpoints

**Files:**
- Create: `klir/api/controller.py`
- Test: `tests/api/test_controller.py`

**Step 1: Write failing tests for list_sessions, list_named_sessions, list_agents, list_cron_jobs, list_tasks, list_processes**

```python
"""Tests for DashboardController."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from klir.api.controller import DashboardController


# ---------------------------------------------------------------------------
# Lightweight fakes — mirror just the fields the DTO serializers access
# ---------------------------------------------------------------------------


@dataclass
class FakeSessionData:
    chat_id: int = 100
    topic_id: int | None = None
    user_id: int | None = None
    topic_name: str | None = None
    provider: str = "claude"
    model: str = "claude-sonnet-4-6"
    session_id: str = "sid1"
    message_count: int = 5
    total_cost_usd: float = 0.10
    total_tokens: int = 2000
    created_at: str = "2026-01-01T00:00:00Z"
    last_active: str = "2026-01-01T01:00:00Z"
    thinking_level: str | None = None


@dataclass
class FakeNamedSession:
    name: str = "boldowl"
    chat_id: int = 100
    provider: str = "claude"
    model: str = "claude-sonnet-4-6"
    session_id: str = "nsid1"
    prompt_preview: str = "Analyze..."
    status: str = "idle"
    created_at: float = 1710430000.0
    message_count: int = 3
    last_prompt: str = ""


@dataclass
class FakeAgentHealth:
    name: str = "main"
    status: str = "running"
    uptime_seconds: float = 3600.0
    restart_count: int = 0
    last_crash_time: float = 0.0
    last_crash_error: str = ""


@dataclass
class FakeTaskEntry:
    task_id: str = "t_1"
    chat_id: int = 100
    parent_agent: str = "main"
    name: str = "research"
    prompt_preview: str = "Research..."
    provider: str = "claude"
    model: str = "claude-sonnet-4-6"
    status: str = "running"
    session_id: str = "tsid1"
    created_at: float = 1710430000.0
    completed_at: float = 0.0
    elapsed_seconds: float = 60.0
    error: str = ""
    result_preview: str = ""
    question_count: int = 0
    num_turns: int = 1
    last_question: str = ""
    original_prompt: str = ""
    thinking: str = ""
    tasks_dir: str = ""
    thread_id: int | None = None


@dataclass
class FakeCronJob:
    id: str = "daily-digest"
    title: str = "Daily Digest"
    description: str = "Summarize"
    schedule: str = "0 9 * * *"
    task_folder: str = ""
    agent_instruction: str = ""
    enabled: bool = True
    timezone: str = ""
    created_at: str = ""
    provider: str | None = "claude"
    model: str | None = None
    reasoning_effort: str | None = None
    cli_parameters: list[str] = field(default_factory=list)
    consecutive_errors: int = 0
    last_error: str | None = None
    last_duration_ms: int | None = 12300
    delivery_status: str | None = "delivered"
    delivery_error: str | None = None
    max_retries: int = 3
    alert_after: int = 3
    alert_cooldown_seconds: int = 3600
    last_alert_at: str | None = None
    quiet_start: int | None = None
    quiet_end: int | None = None
    dependency: str | None = None
    routing_chat_id: int | None = None
    routing_topic_id: int | None = None
    routing_transport: str | None = None


@dataclass
class FakeTrackedProcess:
    process: Any = None
    chat_id: int = 100
    label: str = "user-message"
    registered_at: float = 1710432000.0

    def __post_init__(self) -> None:
        if self.process is None:
            self.process = MagicMock(pid=12345)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def controller() -> DashboardController:
    session_mgr = AsyncMock()
    session_mgr.list_all = AsyncMock(return_value=[FakeSessionData()])

    named_registry = MagicMock()
    named_registry.list_all_active.return_value = [FakeNamedSession()]

    cron_mgr = MagicMock()
    cron_mgr.list_jobs.return_value = [FakeCronJob()]
    cron_mgr.get_job.return_value = FakeCronJob()
    cron_mgr.set_enabled.return_value = True

    task_registry = MagicMock()
    task_registry.list_all.return_value = [FakeTaskEntry()]

    process_registry = MagicMock()
    process_registry.list_all_active.return_value = [FakeTrackedProcess()]

    message_handler = AsyncMock()
    abort_handler = AsyncMock(return_value=2)

    history_store = AsyncMock()
    history_store.query = AsyncMock(return_value=([], False))

    dashboard_hub = MagicMock()
    dashboard_hub.client_count = 1

    observer_status_getter = lambda: {"cron": True, "heartbeat": True}
    config_summary_getter = lambda: {"providers": ["claude"]}
    agent_health_getter = lambda: {"main": FakeAgentHealth()}

    return DashboardController(
        session_mgr=session_mgr,
        named_registry=named_registry,
        cron_mgr=cron_mgr,
        task_registry_getter=lambda: task_registry,
        process_registry=process_registry,
        message_handler=message_handler,
        abort_handler=abort_handler,
        history_store=history_store,
        dashboard_hub=dashboard_hub,
        observer_status_getter=observer_status_getter,
        config_summary_getter=config_summary_getter,
        agent_health_getter=agent_health_getter,
    )


# ---------------------------------------------------------------------------
# Tests — list endpoints
# ---------------------------------------------------------------------------


class TestListSessions:
    async def test_returns_all_sessions(self, controller: DashboardController) -> None:
        result = await controller.list_sessions()
        assert "sessions" in result
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["chat_id"] == 100

    async def test_filters_by_chat_id(self, controller: DashboardController) -> None:
        result = await controller.list_sessions(chat_id=999)
        assert result["sessions"] == []


class TestListNamedSessions:
    async def test_returns_all(self, controller: DashboardController) -> None:
        result = await controller.list_named_sessions()
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["name"] == "boldowl"

    async def test_filters_by_status(self, controller: DashboardController) -> None:
        result = await controller.list_named_sessions(status="running")
        assert result["sessions"] == []


class TestListAgents:
    async def test_returns_agents(self, controller: DashboardController) -> None:
        result = await controller.list_agents()
        assert "agents" in result
        assert "main" in result["agents"]
        assert result["agents"]["main"]["status"] == "running"


class TestListCronJobs:
    async def test_returns_jobs(self, controller: DashboardController) -> None:
        result = await controller.list_cron_jobs()
        assert len(result["jobs"]) == 1
        assert result["jobs"][0]["id"] == "daily-digest"


class TestListTasks:
    async def test_returns_all(self, controller: DashboardController) -> None:
        result = await controller.list_tasks()
        assert len(result["tasks"]) == 1
        assert result["tasks"][0]["task_id"] == "t_1"

    async def test_filters_by_status(self, controller: DashboardController) -> None:
        result = await controller.list_tasks(status="done")
        assert result["tasks"] == []

    async def test_filters_by_agent(self, controller: DashboardController) -> None:
        result = await controller.list_tasks(agent="nonexistent")
        assert result["tasks"] == []


class TestListProcesses:
    async def test_returns_processes(self, controller: DashboardController) -> None:
        result = await controller.list_processes()
        assert len(result["processes"]) == 1
        assert result["processes"][0]["pid"] == 12345
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/api/test_controller.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'klir.api.controller'`

**Step 3: Write minimal controller with list methods**

Create `klir/api/controller.py`:

```python
"""Dashboard REST API controller: business logic for dashboard endpoints."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from klir.api.dashboard import (
    agent_health_to_dto,
    cron_job_to_dto,
    named_session_to_dto,
    process_to_dto,
    session_to_dto,
    task_to_dto,
)

if TYPE_CHECKING:
    from klir.api.dashboard import DashboardHub
    from klir.cli.process_registry import ProcessRegistry
    from klir.cron.manager import CronManager
    from klir.history.store import MessageHistory
    from klir.session.manager import SessionManager
    from klir.session.named import NamedSessionRegistry
    from klir.tasks.registry import TaskRegistry

logger = logging.getLogger(__name__)

# Callback types matching Orchestrator.handle_message_streaming / abort
StreamingMessageHandler = Callable[..., Awaitable[Any]]
AbortHandler = Callable[[int], Awaitable[int]]


class DashboardController:
    """Business logic for dashboard REST endpoints.

    Pure logic layer — no aiohttp types. Returns plain dicts.
    """

    def __init__(  # noqa: PLR0913
        self,
        *,
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
        agent_health_getter: Callable[[], Any],
    ) -> None:
        self._session_mgr = session_mgr
        self._named_registry = named_registry
        self._cron_mgr = cron_mgr
        self._task_registry_getter = task_registry_getter
        self._process_registry = process_registry
        self._message_handler = message_handler
        self._abort_handler = abort_handler
        self._history_store = history_store
        self._dashboard_hub = dashboard_hub
        self._observer_status_getter = observer_status_getter
        self._config_summary_getter = config_summary_getter
        self._agent_health_getter = agent_health_getter

    # -- Sessions --------------------------------------------------------------

    async def list_sessions(self, *, chat_id: int | None = None) -> dict[str, Any]:
        all_sessions = await self._session_mgr.list_all()
        dtos = [session_to_dto(s) for s in all_sessions]
        if chat_id is not None:
            dtos = [s for s in dtos if s["chat_id"] == chat_id]
        return {"sessions": dtos}

    # -- Named sessions --------------------------------------------------------

    async def list_named_sessions(
        self,
        *,
        chat_id: int | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        all_ns = self._named_registry.list_all_active()
        dtos = [named_session_to_dto(ns) for ns in all_ns]
        if chat_id is not None:
            dtos = [d for d in dtos if d["chat_id"] == chat_id]
        if status is not None:
            dtos = [d for d in dtos if d["status"] == status]
        return {"sessions": dtos}

    # -- Agents ----------------------------------------------------------------

    async def list_agents(self) -> dict[str, Any]:
        raw = self._agent_health_getter()
        agents = {
            name: agent_health_to_dto(name, health)
            for name, health in raw.items()
        }
        return {"agents": agents}

    # -- Cron ------------------------------------------------------------------

    async def list_cron_jobs(self) -> dict[str, Any]:
        jobs = self._cron_mgr.list_jobs()
        return {"jobs": [cron_job_to_dto(j) for j in jobs]}

    # -- Tasks -----------------------------------------------------------------

    async def list_tasks(
        self,
        *,
        status: str | None = None,
        agent: str | None = None,
    ) -> dict[str, Any]:
        registry = self._task_registry_getter()
        if registry is None:
            return {"tasks": []}
        entries = registry.list_all()
        dtos = [task_to_dto(e) for e in entries]
        if status is not None:
            dtos = [d for d in dtos if d["status"] == status]
        if agent is not None:
            dtos = [d for d in dtos if d["parent_agent"] == agent]
        return {"tasks": dtos}

    # -- Processes -------------------------------------------------------------

    async def list_processes(self) -> dict[str, Any]:
        tracked = self._process_registry.list_all_active()
        return {"processes": [process_to_dto(tp) for tp in tracked]}
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_controller.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add klir/api/controller.py tests/api/test_controller.py
git commit -m "feat(api): Add DashboardController with list endpoints"
```

---

### Task 2: Controller — history, cron history, and health endpoints

**Files:**
- Modify: `klir/api/controller.py`
- Modify: `tests/api/test_controller.py`

**Step 1: Write failing tests for get_history, get_cron_history, get_health**

Add to `tests/api/test_controller.py`:

```python
class TestGetHistory:
    async def test_returns_messages(self, controller: DashboardController) -> None:
        controller._history_store.query = AsyncMock(
            return_value=(
                [{"id": "msg_1", "ts": 1710432000.0, "text": "Hello"}],
                False,
            )
        )
        result = await controller.get_history(chat_id=100)
        assert len(result["messages"]) == 1
        assert result["has_more"] is False

    async def test_passes_pagination_params(self, controller: DashboardController) -> None:
        controller._history_store.query = AsyncMock(return_value=([], True))
        result = await controller.get_history(
            chat_id=100, limit=10, before=1710432000.0, origin="user"
        )
        controller._history_store.query.assert_called_once_with(
            100, topic_id=None, limit=10, before=1710432000.0, origin="user"
        )
        assert result["has_more"] is True

    async def test_clamps_limit(self, controller: DashboardController) -> None:
        controller._history_store.query = AsyncMock(return_value=([], False))
        await controller.get_history(chat_id=100, limit=999)
        call_args = controller._history_store.query.call_args
        assert call_args.kwargs.get("limit", call_args.args[1] if len(call_args.args) > 1 else None) <= 200


class TestGetCronHistory:
    async def test_returns_runs(self, controller: DashboardController) -> None:
        result = await controller.get_cron_history(job_id="daily-digest")
        assert "runs" in result

    async def test_unknown_job_returns_empty(self, controller: DashboardController) -> None:
        controller._cron_mgr.get_job.return_value = None
        result = await controller.get_cron_history(job_id="nonexistent")
        assert result["runs"] == []


class TestGetHealth:
    async def test_returns_health(self, controller: DashboardController) -> None:
        result = await controller.get_health()
        assert result["status"] == "ok"
        assert "observers" in result
        assert "connections" in result
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/api/test_controller.py -k "TestGetHistory or TestGetCronHistory or TestGetHealth" -v`
Expected: FAIL — `AttributeError: 'DashboardController' object has no attribute 'get_history'`

**Step 3: Implement get_history, get_cron_history, get_health on controller**

Add to `klir/api/controller.py`:

```python
    # At the top of the file, add the import:
    from klir.cron.run_log import read_run_log_page

    # -- History ---------------------------------------------------------------

    async def get_history(
        self,
        chat_id: int,
        *,
        topic_id: int | None = None,
        limit: int = 50,
        before: float | None = None,
        origin: str | None = None,
    ) -> dict[str, Any]:
        limit = min(max(limit, 1), 200)
        messages, has_more = await self._history_store.query(
            chat_id, topic_id=topic_id, limit=limit, before=before, origin=origin
        )
        result: dict[str, Any] = {"messages": messages, "has_more": has_more}
        if has_more and messages:
            result["next_cursor"] = messages[-1].get("ts")
        return result

    # -- Cron history ----------------------------------------------------------

    async def get_cron_history(
        self,
        job_id: str,
        *,
        limit: int = 20,
    ) -> dict[str, Any]:
        job = self._cron_mgr.get_job(job_id)
        if job is None:
            return {"runs": []}
        limit = min(max(limit, 1), 100)
        page = await read_run_log_page(
            self._history_store._db,
            job_id=job_id,
            limit=limit,
        )
        runs = [
            {
                "ts": e.ts,
                "job_id": e.job_id,
                "status": e.status,
                "duration_ms": e.duration_ms,
                "delivery_status": e.delivery_status,
                "provider": e.provider,
                "model": e.model,
                "input_tokens": e.input_tokens,
                "output_tokens": e.output_tokens,
                "summary": e.summary,
                "error": e.error,
            }
            for e in page.entries
        ]
        return {"runs": runs}

    # -- Health ----------------------------------------------------------------

    async def get_health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "connections": {
                "dashboard_clients": self._dashboard_hub.client_count,
            },
            "observers": self._observer_status_getter(),
        }
```

Note: `get_cron_history` needs access to `KlirDB` for `read_run_log_page`. The cleanest way is to add a `db` parameter to the controller constructor. Alternatively, since `MessageHistory` wraps a `KlirDB`, we access it via `self._history_store._db`. However, this couples us to internals. Better approach: add `db: KlirDB` to the controller constructor.

Update the constructor to accept `db`:

```python
    def __init__(
        self,
        *,
        # ... existing params ...
        db: KlirDB,
    ) -> None:
        # ... existing assigns ...
        self._db = db
```

Then `get_cron_history` uses `self._db` instead of `self._history_store._db`.

Update the fixture accordingly:

```python
@pytest.fixture()
def controller() -> DashboardController:
    # ... existing setup ...
    db = AsyncMock()  # KlirDB mock

    return DashboardController(
        # ... existing params ...
        db=db,
    )
```

For `get_cron_history`, mock `read_run_log_page` at the module level in tests:

```python
from unittest.mock import patch

class TestGetCronHistory:
    async def test_returns_runs(self, controller: DashboardController) -> None:
        fake_page = MagicMock()
        fake_page.entries = []
        with patch("klir.api.controller.read_run_log_page", new_callable=AsyncMock, return_value=fake_page):
            result = await controller.get_cron_history(job_id="daily-digest")
        assert "runs" in result
        assert result["runs"] == []
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_controller.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add klir/api/controller.py tests/api/test_controller.py
git commit -m "feat(api): Add history, cron history, and health to controller"
```

---

### Task 3: Controller — action endpoints (toggle cron, cancel task, abort, send message)

**Files:**
- Modify: `klir/api/controller.py`
- Modify: `tests/api/test_controller.py`

**Step 1: Write failing tests for toggle_cron_job, cancel_task, abort_chat, send_message**

Add to `tests/api/test_controller.py`:

```python
class TestToggleCronJob:
    async def test_toggles_job(self, controller: DashboardController) -> None:
        result = await controller.toggle_cron_job(job_id="daily-digest", enabled=False)
        assert result["ok"] is True
        assert result["job_id"] == "daily-digest"
        assert result["enabled"] is False
        controller._cron_mgr.set_enabled.assert_called_once_with("daily-digest", enabled=False)

    async def test_unknown_job(self, controller: DashboardController) -> None:
        controller._cron_mgr.set_enabled.return_value = False
        result = await controller.toggle_cron_job(job_id="nonexistent", enabled=True)
        assert result["ok"] is False


class TestCancelTask:
    async def test_cancels_task(self, controller: DashboardController) -> None:
        registry = controller._task_registry_getter()
        registry.delete = AsyncMock(return_value=True)
        result = await controller.cancel_task(task_id="t_1")
        assert result["ok"] is True
        assert result["task_id"] == "t_1"

    async def test_no_registry(self, controller: DashboardController) -> None:
        controller._task_registry_getter = lambda: None
        result = await controller.cancel_task(task_id="t_1")
        assert result["ok"] is False


class TestAbortChat:
    async def test_aborts(self, controller: DashboardController) -> None:
        result = await controller.abort_chat(chat_id=100)
        assert result["ok"] is True
        assert result["killed"] == 2


class TestSendMessage:
    async def test_non_streaming(self, controller: DashboardController) -> None:
        fake_result = MagicMock()
        fake_result.text = "Hello back"
        fake_result.stream_fallback = False
        controller._message_handler.return_value = fake_result
        result = await controller.send_message(chat_id=100, text="Hello")
        assert result["ok"] is True
        assert result["result"]["text"] == "Hello back"
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/api/test_controller.py -k "TestToggle or TestCancel or TestAbort or TestSendMessage" -v`
Expected: FAIL — `AttributeError`

**Step 3: Implement action methods on controller**

Add to `klir/api/controller.py`:

```python
    # -- Toggle cron -----------------------------------------------------------

    async def toggle_cron_job(self, job_id: str, *, enabled: bool) -> dict[str, Any]:
        ok = self._cron_mgr.set_enabled(job_id, enabled=enabled)
        return {"ok": ok, "job_id": job_id, "enabled": enabled}

    # -- Cancel task -----------------------------------------------------------

    async def cancel_task(self, task_id: str) -> dict[str, Any]:
        registry = self._task_registry_getter()
        if registry is None:
            return {"ok": False, "task_id": task_id}
        ok = await registry.delete(task_id)
        return {"ok": ok, "task_id": task_id}

    # -- Abort -----------------------------------------------------------------

    async def abort_chat(self, chat_id: int) -> dict[str, Any]:
        killed = await self._abort_handler(chat_id)
        return {"ok": True, "killed": killed}

    # -- Send message (non-streaming) ------------------------------------------

    async def send_message(
        self,
        chat_id: int,
        text: str,
        *,
        topic_id: int | None = None,
    ) -> dict[str, Any]:
        key = SessionKey(chat_id=chat_id, topic_id=topic_id)
        try:
            result = await self._message_handler(key, text)
        except Exception:
            logger.exception("send_message error chat=%d", chat_id)
            return {"ok": False, "error": "internal_error"}
        return {
            "ok": True,
            "result": {
                "text": result.text,
            },
        }
```

Add the import at top of controller:

```python
from klir.session.key import SessionKey
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_controller.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add klir/api/controller.py tests/api/test_controller.py
git commit -m "feat(api): Add action endpoints to controller"
```

---

### Task 4: Controller — SSE streaming for send_message

**Files:**
- Modify: `klir/api/controller.py`
- Modify: `tests/api/test_controller.py`

**Step 1: Write failing test for SSE streaming**

Add to `tests/api/test_controller.py`:

```python
class TestSendMessageStreaming:
    async def test_yields_sse_events(self, controller: DashboardController) -> None:
        async def fake_handler(key: Any, text: str, **kwargs: Any) -> MagicMock:
            # Simulate streaming: call the callbacks
            await kwargs["on_text_delta"]("Hello ")
            await kwargs["on_text_delta"]("world")
            await kwargs["on_tool_activity"]("read_file")
            await kwargs["on_system_status"]("Thinking...")
            result = MagicMock()
            result.text = "Hello world"
            result.stream_fallback = False
            return result

        controller._message_handler = fake_handler

        events: list[str] = []
        async for chunk in controller.send_message_stream(chat_id=100, text="Hi"):
            events.append(chunk)

        # Should have text_delta, text_delta, tool_activity, system_status, result
        assert any("text_delta" in e for e in events)
        assert any("tool_activity" in e for e in events)
        assert any("system_status" in e for e in events)
        assert any("result" in e for e in events)

    async def test_sse_format(self, controller: DashboardController) -> None:
        async def fake_handler(key: Any, text: str, **kwargs: Any) -> MagicMock:
            await kwargs["on_text_delta"]("Hi")
            result = MagicMock()
            result.text = "Hi"
            result.stream_fallback = False
            return result

        controller._message_handler = fake_handler

        events: list[str] = []
        async for chunk in controller.send_message_stream(chat_id=100, text="test"):
            events.append(chunk)

        # Each SSE chunk should follow "event: <type>\ndata: <json>\n\n" format
        for event in events:
            assert event.startswith("event: ")
            assert "\ndata: " in event
            assert event.endswith("\n\n")
```

**Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/api/test_controller.py -k "TestSendMessageStreaming" -v`
Expected: FAIL — `AttributeError: 'DashboardController' object has no attribute 'send_message_stream'`

**Step 3: Implement SSE streaming method**

Add to `klir/api/controller.py`:

```python
    import json as _json  # at top of file, already imported implicitly via other deps

    async def send_message_stream(
        self,
        chat_id: int,
        text: str,
        *,
        topic_id: int | None = None,
    ) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted event strings for streaming message responses."""
        queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()

        async def on_text_delta(delta: str) -> None:
            await queue.put(("text_delta", {"text": delta}))

        async def on_tool_activity(name: str) -> None:
            await queue.put(("tool_activity", {"tool": name}))

        async def on_system_status(label: str | None) -> None:
            await queue.put(("system_status", {"label": label}))

        key = SessionKey(chat_id=chat_id, topic_id=topic_id)

        async def run_handler() -> Any:
            try:
                result = await self._message_handler(
                    key,
                    text,
                    on_text_delta=on_text_delta,
                    on_tool_activity=on_tool_activity,
                    on_system_status=on_system_status,
                )
                return result
            finally:
                await queue.put(None)  # sentinel

        task = asyncio.create_task(run_handler())

        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                event_type, data = item
                yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

            # Yield final result
            result = await task
            yield f"event: result\ndata: {json.dumps({'text': result.text})}\n\n"
        except asyncio.CancelledError:
            task.cancel()
            raise
```

Add imports at top:

```python
import asyncio
import json
from collections.abc import AsyncGenerator
```

**Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/api/test_controller.py -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add klir/api/controller.py tests/api/test_controller.py
git commit -m "feat(api): Add SSE streaming to controller"
```

---

### Task 5: Routes — thin aiohttp route layer

**Files:**
- Create: `klir/api/routes.py`
- Modify: `tests/api/test_controller.py` (add route-level tests, optional)

**Step 1: Create routes.py with all 13 endpoint handlers**

```python
"""Dashboard REST API routes: thin aiohttp layer delegating to DashboardController."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import TYPE_CHECKING

from aiohttp import web

if TYPE_CHECKING:
    from klir.api.controller import DashboardController

logger = logging.getLogger(__name__)


def register_dashboard_routes(
    app: web.Application,
    controller: DashboardController,
    verify_bearer: Callable[[web.Request], bool],
) -> None:
    """Register all dashboard REST endpoints on the aiohttp app."""

    def _require_auth(request: web.Request) -> web.Response | None:
        if not verify_bearer(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        return None

    # -- Sessions --------------------------------------------------------------

    async def handle_list_sessions(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        chat_id_raw = request.query.get("chat_id")
        chat_id = int(chat_id_raw) if chat_id_raw else None
        result = await controller.list_sessions(chat_id=chat_id)
        return web.json_response(result)

    async def handle_session_history(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        chat_id = int(request.match_info["chat_id"])
        topic_id_raw = request.query.get("topic_id")
        topic_id = int(topic_id_raw) if topic_id_raw else None
        limit = min(int(request.query.get("limit", "50")), 200)
        before_raw = request.query.get("before")
        before = float(before_raw) if before_raw else None
        origin = request.query.get("origin")
        result = await controller.get_history(
            chat_id, topic_id=topic_id, limit=limit, before=before, origin=origin
        )
        return web.json_response(result)

    # -- Named sessions --------------------------------------------------------

    async def handle_list_named_sessions(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        chat_id_raw = request.query.get("chat_id")
        chat_id = int(chat_id_raw) if chat_id_raw else None
        status = request.query.get("status")
        result = await controller.list_named_sessions(chat_id=chat_id, status=status)
        return web.json_response(result)

    # -- Agents ----------------------------------------------------------------

    async def handle_list_agents(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        result = await controller.list_agents()
        return web.json_response(result)

    # -- Cron ------------------------------------------------------------------

    async def handle_list_cron(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        result = await controller.list_cron_jobs()
        return web.json_response(result)

    async def handle_cron_history(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        job_id = request.match_info["job_id"]
        limit = min(int(request.query.get("limit", "20")), 100)
        result = await controller.get_cron_history(job_id, limit=limit)
        return web.json_response(result)

    async def handle_toggle_cron(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        job_id = request.match_info["job_id"]
        try:
            body = await request.json()
        except (json.JSONDecodeError, ValueError):
            return web.json_response({"error": "invalid JSON body"}, status=400)
        enabled = body.get("enabled")
        if not isinstance(enabled, bool):
            return web.json_response({"error": "'enabled' must be a boolean"}, status=400)
        result = await controller.toggle_cron_job(job_id, enabled=enabled)
        return web.json_response(result)

    # -- Tasks -----------------------------------------------------------------

    async def handle_list_tasks(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        status = request.query.get("status")
        agent = request.query.get("agent")
        result = await controller.list_tasks(status=status, agent=agent)
        return web.json_response(result)

    async def handle_cancel_task(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        task_id = request.match_info["task_id"]
        result = await controller.cancel_task(task_id)
        return web.json_response(result)

    # -- Processes -------------------------------------------------------------

    async def handle_list_processes(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        result = await controller.list_processes()
        return web.json_response(result)

    # -- Send message ----------------------------------------------------------

    async def handle_send_message(request: web.Request) -> web.StreamResponse:
        if err := _require_auth(request):
            return err
        chat_id = int(request.match_info["chat_id"])
        try:
            body = await request.json()
        except (json.JSONDecodeError, ValueError):
            return web.json_response({"error": "invalid JSON body"}, status=400)
        text = body.get("text", "")
        if not text:
            return web.json_response({"error": "'text' is required"}, status=400)
        topic_id = body.get("topic_id")
        stream = body.get("stream", False)

        if stream:
            response = web.StreamResponse(
                status=200,
                headers={
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                },
            )
            await response.prepare(request)
            async for chunk in controller.send_message_stream(
                chat_id, text, topic_id=topic_id
            ):
                await response.write(chunk.encode())
            await response.write_eof()
            return response

        result = await controller.send_message(chat_id, text, topic_id=topic_id)
        return web.json_response(result)

    # -- Health ----------------------------------------------------------------

    async def handle_health(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        result = await controller.get_health()
        return web.json_response(result)

    # -- Abort -----------------------------------------------------------------

    async def handle_abort(request: web.Request) -> web.Response:
        if err := _require_auth(request):
            return err
        try:
            body = await request.json()
        except (json.JSONDecodeError, ValueError):
            return web.json_response({"error": "invalid JSON body"}, status=400)
        chat_id = body.get("chat_id")
        if not isinstance(chat_id, int):
            return web.json_response({"error": "'chat_id' must be an integer"}, status=400)
        result = await controller.abort_chat(chat_id)
        return web.json_response(result)

    # -- Register routes -------------------------------------------------------

    app.router.add_get("/api/sessions", handle_list_sessions)
    app.router.add_get("/api/sessions/{chat_id}/history", handle_session_history)
    app.router.add_get("/api/named-sessions", handle_list_named_sessions)
    app.router.add_get("/api/agents", handle_list_agents)
    app.router.add_get("/api/cron", handle_list_cron)
    app.router.add_get("/api/cron/{job_id}/history", handle_cron_history)
    app.router.add_patch("/api/cron/{job_id}", handle_toggle_cron)
    app.router.add_get("/api/tasks", handle_list_tasks)
    app.router.add_post("/api/tasks/{task_id}/cancel", handle_cancel_task)
    app.router.add_get("/api/processes", handle_list_processes)
    app.router.add_post("/api/sessions/{chat_id}/message", handle_send_message)
    app.router.add_get("/api/health", handle_health)
    app.router.add_post("/api/abort", handle_abort)
```

**Step 2: Run ruff/mypy to check for issues**

Run: `uv run ruff check klir/api/routes.py && uv run ruff format klir/api/routes.py`
Expected: No errors

**Step 3: Commit**

```bash
git add klir/api/routes.py
git commit -m "feat(api): Add thin route layer for dashboard REST endpoints"
```

---

### Task 6: Wire routes into ApiServer.start()

**Files:**
- Modify: `klir/api/server.py:262-289` (the `start()` method)

**Step 1: Import routes and controller in server.py**

At the top of `klir/api/server.py`, add alongside the existing dashboard import:

```python
try:
    from klir.api.controller import DashboardController
    from klir.api.routes import register_dashboard_routes
except ImportError:  # pragma: no cover
    DashboardController = None  # type: ignore[assignment,misc]
    register_dashboard_routes = None  # type: ignore[assignment,misc]
```

**Step 2: Wire in `start()` method**

After existing route registration in `start()`, add controller construction and route registration. Since dashboard is always enabled, no `enabled` check:

```python
    async def start(self) -> None:
        # ... existing code ...
        app.router.add_get("/ws/dashboard", self._handle_dashboard_ws)

        # Dashboard REST API — always registered
        if (
            self._snapshot_sources is not None
            and self._dashboard_hub is not None
            and DashboardController is not None
            and register_dashboard_routes is not None
        ):
            src = self._snapshot_sources
            controller = DashboardController(
                session_mgr=src["session_mgr"],
                named_registry=src["named_registry"],
                cron_mgr=src["cron_mgr"],
                task_registry_getter=src["task_registry_getter"],
                process_registry=src["process_registry"],
                message_handler=self._handle_message,
                abort_handler=self._handle_abort,
                history_store=src.get("history_store"),
                dashboard_hub=self._dashboard_hub,
                observer_status_getter=src["observer_status_getter"],
                config_summary_getter=src["config_summary_getter"],
                agent_health_getter=src["agent_health_getter"],
                db=src.get("db"),
            )
            register_dashboard_routes(app, controller, self._verify_bearer)
            logger.info("Dashboard REST API routes registered")

        self._runner = web.AppRunner(app, access_log=None)
        # ... rest of existing code ...
```

Note: This requires `set_snapshot_sources` to also pass `history_store` and `db`. Update that setter's dict to include them, or add a new setter. The simplest approach: the caller that calls `set_snapshot_sources` should also pass `history_store` and `db` in the sources dict.

**Step 3: Run full test suite**

Run: `uv run pytest -x`
Expected: All tests PASS (no regressions)

**Step 4: Commit**

```bash
git add klir/api/server.py
git commit -m "feat(api): Wire dashboard REST routes into ApiServer"
```

---

### Task 7: Update snapshot sources to include history_store and db

**Files:**
- Modify: `klir/api/server.py` — update `set_snapshot_sources` to accept `history_store` and `db`
- Modify: wherever `set_snapshot_sources` is called (likely `klir/orchestrator/observers.py` or `klir/bot/app.py`)

**Step 1: Find the caller**

Run: `rg "set_snapshot_sources" klir/` to find where it's called.

**Step 2: Update the setter signature and the call site**

Add `history_store` and `db` as optional params to `set_snapshot_sources`:

```python
    def set_snapshot_sources(  # noqa: PLR0913
        self,
        session_mgr: Any,
        named_registry: Any,
        agent_health_getter: Callable[[], Any],
        cron_mgr: Any,
        task_registry_getter: Callable[[], Any],
        process_registry: Any,
        observer_status_getter: Callable[[], dict[str, Any]],
        config_summary_getter: Callable[[], dict[str, Any]],
        history_store: Any = None,
        db: Any = None,
    ) -> None:
        self._snapshot_sources = {
            # ... existing keys ...
            "history_store": history_store,
            "db": db,
        }
```

Update the call site to pass the new args.

**Step 3: Run tests and commit**

Run: `uv run pytest -x`

```bash
git add klir/api/server.py <call-site-file>
git commit -m "feat(api): Pass history_store and db through snapshot sources"
```

---

### Task 8: Run full quality checks and verify

**Step 1: Run ruff format**

Run: `uv run ruff format klir/api/controller.py klir/api/routes.py`

**Step 2: Run ruff check**

Run: `uv run ruff check klir/api/ tests/api/`

**Step 3: Run mypy**

Run: `uv run mypy klir/api/controller.py klir/api/routes.py`

**Step 4: Run full test suite**

Run: `uv run pytest -x -v`

**Step 5: Fix any issues found, then commit**

```bash
git add -u
git commit -m "style: Format and fix lint issues in dashboard REST API"
```

---

## Summary

| Task | Files | What |
|------|-------|------|
| 1 | `controller.py`, `test_controller.py` | Read-only list endpoints (6 methods) |
| 2 | `controller.py`, `test_controller.py` | History, cron history, health (3 methods) |
| 3 | `controller.py`, `test_controller.py` | Action endpoints (4 methods) |
| 4 | `controller.py`, `test_controller.py` | SSE streaming for send_message |
| 5 | `routes.py` | Thin aiohttp route layer (13 handlers) |
| 6 | `server.py` | Wire routes into ApiServer.start() |
| 7 | `server.py` + call site | Pass history_store and db through snapshot sources |
| 8 | All files | Quality checks (ruff, mypy, full test suite) |
