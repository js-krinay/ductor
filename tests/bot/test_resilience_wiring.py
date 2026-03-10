"""Tests for resilience wiring in TelegramBot startup."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestResilienceWiring:
    def test_bot_session_receives_resilience_config(self) -> None:
        """Verify create_bot_session is called with resilience_config from AgentConfig."""
        from ductor_bot.config import AgentConfig

        cfg = AgentConfig(telegram_token="test:token")

        with (
            patch("ductor_bot.bot.app.create_bot_session") as mock_create,
            patch("ductor_bot.bot.app.resolve_proxy_url", return_value=None),
            patch("ductor_bot.bot.app.Bot"),
            patch("ductor_bot.bot.app.Dispatcher"),
            patch("ductor_bot.bot.app.ReactionService"),
        ):
            mock_create.return_value = None
            from ductor_bot.bot.app import TelegramBot

            TelegramBot(cfg)

            mock_create.assert_called_once_with(None, resilience_config=cfg.resilience)

    def test_bot_session_with_custom_resilience(self) -> None:
        """Verify custom resilience config propagates through."""
        from ductor_bot.config import AgentConfig

        cfg = AgentConfig(
            telegram_token="test:token",
            resilience={"max_retries": 5},
        )
        assert cfg.resilience.max_retries == 5
