"""Tests for thinking level in session data."""

from __future__ import annotations

from dataclasses import asdict

from klir.session.manager import SessionData


def test_default_thinking_level_is_none() -> None:
    s = SessionData(chat_id=1)
    assert s.thinking_level is None


def test_thinking_level_round_trips() -> None:
    s = SessionData(chat_id=1, thinking_level="high")
    assert s.thinking_level == "high"


def test_thinking_level_serializes() -> None:
    s = SessionData(chat_id=1, thinking_level="low")
    d = asdict(s)
    chat_id = d.pop("chat_id")
    restored = SessionData(chat_id=chat_id, **d)
    assert restored.thinking_level == "low"


def test_legacy_session_without_thinking_level() -> None:
    """Old session JSON without thinking_level should default to None."""
    s = SessionData(chat_id=1, provider="claude", model="opus")
    assert s.thinking_level is None
