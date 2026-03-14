"""Command handlers for all slash commands."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from klir.cli.auth import check_all_auth
from klir.i18n import t
from klir.infra.version import check_pypi, get_current_version
from klir.orchestrator.registry import OrchestratorResult
from klir.orchestrator.selectors.cron_selector import cron_selector_start
from klir.orchestrator.selectors.model_selector import model_selector_start, switch_model
from klir.orchestrator.selectors.models import Button, ButtonGrid
from klir.orchestrator.selectors.session_selector import session_selector_start
from klir.orchestrator.selectors.task_selector import task_selector_start
from klir.text.response_format import SEP, fmt, new_session_text
from klir.workspace.loader import read_mainmemory

if TYPE_CHECKING:
    from klir.orchestrator.core import Orchestrator
    from klir.session.key import SessionKey

THINKING_LEVELS = frozenset({"off", "minimal", "low", "medium", "high"})

COMPACT_PROMPT = (
    "Summarize our entire conversation so far into a concise context block. "
    "Keep key decisions, facts, preferences, and open threads. "
    "Drop greetings, small talk, and resolved tangents. "
    "Present the summary as a structured note I can use to continue seamlessly."
)

logger = logging.getLogger(__name__)


# -- Command wrappers (registered by Orchestrator._register_commands) --


async def cmd_think(orch: Orchestrator, key: SessionKey, text: str) -> OrchestratorResult:
    """Handle /think [level]: get or set reasoning effort."""
    parts = text.split(None, 1)
    session = await orch._sessions.get_active(key)

    if len(parts) < 2:
        current = session.thinking_level if session else None
        label = current or "default"
        valid = ", ".join(sorted(THINKING_LEVELS))
        return OrchestratorResult(text=t("cmd.think.current", label=label, valid=valid))

    level = parts[1].strip().lower()
    if level not in THINKING_LEVELS:
        valid = ", ".join(sorted(THINKING_LEVELS))
        return OrchestratorResult(text=t("cmd.think.invalid", level=level, valid=valid))

    if not session:
        return OrchestratorResult(text=t("cmd.think.no_session"))

    session.thinking_level = None if level == "off" else level
    await orch._sessions.save_session(session)
    return OrchestratorResult(text=t("cmd.think.set", level=level))


async def cmd_reset(orch: Orchestrator, key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /new: kill processes and reset only active provider session."""
    logger.info("Reset requested")
    await orch._process_registry.kill_all(key.chat_id)
    provider = await orch.reset_active_provider_session(key)
    return OrchestratorResult(text=new_session_text(provider))


async def cmd_compact(orch: Orchestrator, key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /compact: summarize and compress session context."""
    session = await orch._sessions.get_active(key)
    if not session or not session.session_id:
        return OrchestratorResult(text=t("cmd.compact.no_session"))

    from klir.cli.types import AgentRequest

    request = AgentRequest(
        prompt=COMPACT_PROMPT,
        model_override=session.model,
        provider_override=session.provider,
        chat_id=key.chat_id,
        topic_id=key.topic_id,
        resume_session=session.session_id,
        timeout_seconds=120.0,
    )
    response = await orch._cli_service.execute(request)
    if response.is_error:
        return OrchestratorResult(text=t("cmd.compact.failed", error=response.result))

    await orch._sessions.update_session(
        session, cost_usd=response.cost_usd, tokens=response.total_tokens
    )
    return OrchestratorResult(text=response.result)


async def cmd_status(orch: Orchestrator, key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /status."""
    logger.info("Status requested")
    return OrchestratorResult(text=await _build_status(orch, key))


async def cmd_model(orch: Orchestrator, key: SessionKey, text: str) -> OrchestratorResult:
    """Handle /model [name]."""
    logger.info("Model requested")
    parts = text.split(None, 1)
    if len(parts) < 2:
        resp = await model_selector_start(orch, key)
        return OrchestratorResult(text=resp.text, buttons=resp.buttons)
    name = parts[1].strip()
    result_text = await switch_model(orch, key, name)
    return OrchestratorResult(text=result_text)


async def cmd_memory(orch: Orchestrator, _key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /memory."""
    logger.info("Memory requested")
    content = await asyncio.to_thread(read_mainmemory, orch.paths)
    if not content.strip():
        return OrchestratorResult(
            text=fmt(
                t("cmd.memory.title"),
                SEP,
                t("cmd.memory.empty"),
                SEP,
                t("cmd.memory.tip_empty"),
            ),
        )
    return OrchestratorResult(
        text=fmt(
            t("cmd.memory.title"),
            SEP,
            content,
            SEP,
            t("cmd.memory.tip"),
        ),
    )


async def cmd_sessions(orch: Orchestrator, key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /sessions."""
    logger.info("Sessions requested")
    resp = await session_selector_start(orch, key.chat_id)
    return OrchestratorResult(text=resp.text, buttons=resp.buttons)


async def cmd_tasks(orch: Orchestrator, key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /tasks."""
    logger.info("Tasks requested")
    hub = orch.task_hub
    if hub is None:
        return OrchestratorResult(
            text=t("cmd.tasks.disabled"),
        )
    resp = task_selector_start(hub, key.chat_id)
    return OrchestratorResult(text=resp.text, buttons=resp.buttons)


async def cmd_cron(orch: Orchestrator, _key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /cron."""
    logger.info("Cron requested")
    resp = await cron_selector_start(orch)
    return OrchestratorResult(text=resp.text, buttons=resp.buttons)


async def cmd_upgrade(_orch: Orchestrator, _key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /upgrade: check for updates and offer upgrade."""
    logger.info("Upgrade check requested")

    from klir.infra.install import detect_install_mode

    if detect_install_mode() == "dev":
        return OrchestratorResult(
            text=fmt(
                t("cmd.upgrade.dev"),
                SEP,
                t("cmd.upgrade.dev_body"),
            ),
        )

    info = await check_pypi(fresh=True)

    if info is None:
        return OrchestratorResult(
            text=t("cmd.upgrade.pypi_error"),
        )

    if not info.update_available:
        keyboard = ButtonGrid(
            rows=[
                [
                    Button(
                        text=t("cmd.upgrade.btn_changelog", version=info.current),
                        callback_data=f"upg:cl:{info.current}",
                    )
                ],
            ]
        )
        return OrchestratorResult(
            text=fmt(
                t("cmd.upgrade.up_to_date"),
                SEP,
                t("cmd.upgrade.up_to_date_body", current=info.current, latest=info.latest),
            ),
            buttons=keyboard,
        )

    keyboard = ButtonGrid(
        rows=[
            [
                Button(
                    text=t("cmd.upgrade.btn_changelog", version=info.latest),
                    callback_data=f"upg:cl:{info.latest}",
                )
            ],
            [
                Button(
                    text=t("cmd.upgrade.btn_yes"),
                    callback_data=f"upg:yes:{info.latest}",
                ),
                Button(text=t("cmd.upgrade.btn_no"), callback_data="upg:no"),
            ],
        ]
    )

    return OrchestratorResult(
        text=fmt(
            t("cmd.upgrade.available"),
            SEP,
            t("cmd.upgrade.available_body", current=info.current, latest=info.latest),
        ),
        buttons=keyboard,
    )


def _build_codex_cache_block(orch: Orchestrator) -> str:
    """Build the Codex model cache section for /diagnose."""
    if not orch._observers.codex_cache_obs:
        return "\n🔄 Codex Model Cache: Observer not initialized"
    cache = orch._observers.codex_cache_obs.get_cache()
    if not cache or not cache.models:
        return "\n🔄 Codex Model Cache: Not loaded"
    default_model = next((m.id for m in cache.models if m.is_default), "N/A")
    return (
        f"\n🔄 Codex Model Cache:\n"
        f"  Last updated: {cache.last_updated}\n"
        f"  Models cached: {len(cache.models)}\n"
        f"  Default model: {default_model}"
    )


def _build_diagnose_health_block(orch: Orchestrator) -> str:
    """Build the multi-agent health section for /diagnose."""
    supervisor = orch._supervisor
    if supervisor is None:
        return ""
    status_icon = {"running": "●", "starting": "◐", "crashed": "✖", "stopped": "○"}
    agent_lines = ["\n**Multi-Agent Health:**"]
    for name in sorted(supervisor.health.keys()):
        h = supervisor.health[name]
        icon = status_icon.get(h.status, "?")
        role = "main" if name == "main" else "sub"
        line = f"  {icon} `{name}` [{role}] — {h.status}"
        if h.status == "running" and h.uptime_human:
            line += f" ({h.uptime_human})"
        if h.restart_count > 0:
            line += f" | restarts: {h.restart_count}"
        if h.status == "crashed" and h.last_crash_error:
            line += f"\n      `{h.last_crash_error[:100]}`"
        agent_lines.append(line)
    return "\n".join(agent_lines)


def _resolve_log_path(orch: Orchestrator) -> Path:
    """Return the best available log file path.

    Sub-agents don't have their own log files — fall back to the central
    log in the main klir home (parent of ``agents/<name>``).
    """
    log_path = orch.paths.logs_dir / "agent.log"
    if not log_path.exists():
        main_logs = orch.paths.klir_home.parent.parent / "logs" / "agent.log"
        if main_logs.exists():
            return main_logs
    return log_path


async def cmd_diagnose(orch: Orchestrator, _key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /diagnose."""
    logger.info("Diagnose requested")
    version = get_current_version()
    effective_model, effective_provider = orch.resolve_runtime_target(orch._config.model)
    info_block = (
        f"Version: `{version}`\n"
        f"Configured: {orch._config.provider} / {orch._config.model}\n"
        f"Effective runtime: {effective_provider} / {effective_model}"
    )

    cache_block = _build_codex_cache_block(orch)
    agent_block = _build_diagnose_health_block(orch)

    log_tail = await _read_log_tail(_resolve_log_path(orch))
    log_block = (
        t("cmd.diagnose.log_header", n=50) + f"\n```\n{log_tail}\n```"
        if log_tail
        else t("cmd.diagnose.no_log")
    )

    return OrchestratorResult(
        text=fmt(
            t("cmd.diagnose.title"), SEP, info_block, cache_block, agent_block, SEP, log_block
        ),
    )


# -- Helpers ------------------------------------------------------------------


def _build_agent_health_block(orch: Orchestrator) -> str:
    """Build the multi-agent health section for /status (main agent only)."""
    supervisor = orch._supervisor
    if supervisor is None or len(supervisor.health) <= 1:
        return ""

    status_icon = {
        "running": "●",
        "starting": "◐",
        "crashed": "✖",
        "stopped": "○",
    }
    agent_lines = [t("status.agents")]
    for name in sorted(supervisor.health.keys()):
        if name == "main":
            continue
        h = supervisor.health[name]
        icon = status_icon.get(h.status, "?")
        line = f"  {icon} {name} — {h.status}"
        if h.status == "running" and h.uptime_human:
            line += f" ({h.uptime_human})"
        if h.restart_count > 0:
            line += f" ⟳{h.restart_count}"
        if h.status == "crashed" and h.last_crash_error:
            line += f"\n      {h.last_crash_error[:80]}"
        agent_lines.append(line)
    return "\n".join(agent_lines)


async def _build_status(orch: Orchestrator, key: SessionKey) -> str:
    """Build the /status response text."""
    runtime_model, _runtime_provider = orch.resolve_runtime_target(orch._config.model)
    configured_model = orch._config.model

    def _model_line(model_name: str) -> str:
        if model_name == configured_model:
            return t("status.model", model=model_name)
        return t("status.model_configured", runtime=model_name, configured=configured_model)

    session = await orch._sessions.get_active(key)
    if session:
        topic_line = t("status.topic", name=session.topic_name) + "\n" if session.topic_name else ""
        session_block = (
            f"{topic_line}"
            f"{t('status.session_id', id=session.session_id[:8] + '...')}\n"
            f"{t('status.messages', count=session.message_count)}\n"
            f"{t('status.tokens', count=f'{session.total_tokens:,}')}\n"
            f"{t('status.cost', cost=f'{session.total_cost_usd:.4f}')}\n"
            f"{_model_line(session.model)}"
        )
    else:
        session_block = f"{t('status.no_session')}\n{_model_line(runtime_model)}"

    bg_tasks = orch.active_background_tasks(key.chat_id)
    bg_block = ""
    if bg_tasks:
        import time

        bg_lines = [t("status.bg_tasks", count=len(bg_tasks))]
        for task in bg_tasks:
            age = time.monotonic() - task.submitted_at
            bg_lines.append(f"  `{task.task_id}` {task.prompt[:40]}... ({age:.0f}s)")
        bg_block = "\n".join(bg_lines)

    auth = await asyncio.to_thread(check_all_auth)
    auth_lines: list[str] = []
    for provider, result in auth.items():
        age_label = f" ({result.age_human})" if result.age_human else ""
        auth_lines.append(f"  [{provider}] {result.status.value}{age_label}")
    auth_block = t("status.auth") + "\n" + "\n".join(auth_lines)

    agent_block = _build_agent_health_block(orch)

    blocks = [t("status.title"), SEP, session_block]
    if bg_block:
        blocks += [SEP, bg_block]
    blocks += [SEP, auth_block]
    if agent_block:
        blocks += [SEP, agent_block]
    return fmt(*blocks)


async def _read_log_tail(log_path: Path, lines: int = 50) -> str:
    """Read the last *lines* of a log file without blocking the event loop."""

    def _read() -> str:
        if not log_path.is_file():
            return ""
        try:
            text = log_path.read_text(encoding="utf-8", errors="replace")
            return "\n".join(text.strip().splitlines()[-lines:])
        except OSError:
            return t("cmd.diagnose.log_read_error")

    return await asyncio.to_thread(_read)


async def cmd_hooks(orch: Orchestrator, _key: SessionKey, _text: str) -> OrchestratorResult:
    """Handle /hooks: list configured user message hooks."""
    hooks = orch._config.message_hooks
    if not hooks:
        return OrchestratorResult(text=t("cmd.hooks.none"))

    lines = [t("cmd.hooks.title") + "\n"]
    for h in hooks:
        status = t("cmd.hooks.status_on") if h.enabled else t("cmd.hooks.status_off")
        lines.append(f"\u2022 **{h.name}** \u2014 {h.phase}/{h.action} [{status}]")
        if h.condition != "always":
            lines.append(f"  condition: {h.condition}={h.pattern or h.provider}")
    return OrchestratorResult(text="\n".join(lines))


async def cmd_cwd(orch: Orchestrator, _key: SessionKey, text: str) -> OrchestratorResult:
    """Handle /cwd [path]: show or change the AI subprocess working directory."""
    from dataclasses import replace as dc_replace

    parts = text.split(None, 1)
    if len(parts) < 2:
        current = orch.effective_working_dir
        return OrchestratorResult(text=t("cmd.cwd.current", path=current))

    raw_path = parts[1].strip()

    def _resolve() -> tuple[Path, bool]:
        p = Path(raw_path).expanduser().resolve()
        return p, p.is_dir()

    target, is_dir = await asyncio.to_thread(_resolve)
    if not is_dir:
        return OrchestratorResult(text=t("cmd.cwd.not_found", path=target))

    orch._cwd_override = str(target)
    # Push the change to the CLI service immediately.
    orch._cli_service.update_config(dc_replace(orch._cli_service._config, working_dir=str(target)))
    return OrchestratorResult(text=t("cmd.cwd.set", path=target))


async def _run_claude_plugin_update(claude_bin: str, plugin_key: str) -> tuple[str, int]:
    """Run ``claude plugin update <key>`` and return (output, returncode).

    Uses ``asyncio.create_subprocess_exec`` with a fixed argument list
    (no shell expansion) to avoid command injection.
    """
    proc = await asyncio.create_subprocess_exec(
        claude_bin,
        "plugin",
        "update",
        plugin_key,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    stdout, _ = await proc.communicate()
    output = stdout.decode(errors="replace").strip() if stdout else ""
    return output, proc.returncode or 0


async def cmd_update_plugins(
    _orch: Orchestrator, _key: SessionKey, _text: str
) -> OrchestratorResult:
    """Handle /update_plugins: update all enabled Claude Code plugins."""
    import json
    import shutil

    claude_bin = shutil.which("claude")
    if not claude_bin:
        return OrchestratorResult(text=t("cmd.plugins.claude_missing"))

    settings_path = Path.home() / ".claude" / "settings.json"
    if not settings_path.exists():
        return OrchestratorResult(text=t("cmd.plugins.settings_missing"))

    try:
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return OrchestratorResult(text=t("cmd.plugins.settings_error"))

    enabled = {key for key, val in settings.get("enabledPlugins", {}).items() if val}
    if not enabled:
        return OrchestratorResult(text=t("cmd.plugins.none_enabled"))

    results: list[str] = []
    for plugin_key in sorted(enabled):
        plugin_name = plugin_key.split("@", 1)[0]
        output, returncode = await _run_claude_plugin_update(claude_bin, plugin_key)
        # Extract the meaningful line from the output
        status = output.splitlines()[-1] if output else f"exit code {returncode}"
        icon = "\u2713" if returncode == 0 else "\u2717"
        results.append(f"{icon} **{plugin_name}**: {status}")

    return OrchestratorResult(
        text=fmt(t("cmd.plugins.title"), SEP, "\n".join(results)),
    )
