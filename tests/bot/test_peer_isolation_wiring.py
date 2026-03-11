"""Tests: peer isolation wires user_id into session key."""

from __future__ import annotations

from unittest.mock import MagicMock

from klir.bot.topic import get_session_key
from klir.config import AgentConfig


def test_get_session_key_without_isolation() -> None:
    """Default: no user_id in key."""
    msg = MagicMock()
    msg.chat.id = 100
    msg.is_topic_message = False
    msg.message_thread_id = None
    msg.from_user.id = 42

    cfg = AgentConfig(peer_isolation=False)
    key = get_session_key(msg, config=cfg)
    assert key.user_id is None


def test_get_session_key_with_isolation() -> None:
    """peer_isolation=True: user_id included in key."""
    msg = MagicMock()
    msg.chat.id = 100
    msg.is_topic_message = False
    msg.message_thread_id = None
    msg.from_user.id = 42

    cfg = AgentConfig(peer_isolation=True)
    key = get_session_key(msg, config=cfg)
    assert key.user_id == 42


def test_get_session_key_isolation_without_config() -> None:
    """No config argument: behaves as before (no user_id)."""
    msg = MagicMock()
    msg.chat.id = 100
    msg.is_topic_message = False
    msg.message_thread_id = None

    key = get_session_key(msg)
    assert key.user_id is None
