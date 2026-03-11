"""Tests for peer isolation configuration."""

from __future__ import annotations

from klir.config import AgentConfig


def test_default_peer_isolation_off() -> None:
    cfg = AgentConfig()
    assert cfg.peer_isolation is False


def test_peer_isolation_enabled() -> None:
    cfg = AgentConfig(peer_isolation=True)
    assert cfg.peer_isolation is True
