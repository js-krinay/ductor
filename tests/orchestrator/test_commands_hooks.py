"""Tests for /hooks command."""

from __future__ import annotations

from klir.config import UserMessageHookConfig
from klir.orchestrator.commands import cmd_hooks
from klir.orchestrator.core import Orchestrator
from klir.session.key import SessionKey


async def test_hooks_empty(orch: Orchestrator) -> None:
    result = await cmd_hooks(orch, SessionKey(chat_id=1), "/hooks")
    assert result is not None
    assert "No user hooks" in result.text


async def test_hooks_lists_configured(orch: Orchestrator) -> None:
    orch._config.message_hooks = [
        UserMessageHookConfig(name="tag", phase="pre", action="prepend", text="[X] "),
        UserMessageHookConfig(name="off", phase="post", action="append", text="Y", enabled=False),
    ]
    result = await cmd_hooks(orch, SessionKey(chat_id=1), "/hooks")
    assert result is not None
    assert "tag" in result.text
    assert "pre" in result.text
    assert "off" in result.text or "disabled" in result.text.lower()
