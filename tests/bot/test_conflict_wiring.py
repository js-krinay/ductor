"""Tests for conflict detection wiring in TelegramBot."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestConflictWiring:
    def test_telegram_bot_has_conflict_detector(self) -> None:
        from ductor_bot.config import AgentConfig

        cfg = AgentConfig(telegram_token="test:token")

        with (
            patch("ductor_bot.bot.app.create_bot_session", return_value=None),
            patch("ductor_bot.bot.app.resolve_proxy_url", return_value=None),
            patch("ductor_bot.bot.app.Bot"),
            patch("ductor_bot.bot.app.Dispatcher"),
            patch("ductor_bot.bot.app.ReactionService"),
        ):
            from ductor_bot.bot.app import TelegramBot

            bot = TelegramBot(cfg)
            assert hasattr(bot, "_conflict_detector")

            from ductor_bot.bot.conflict_detector import ConflictDetector

            assert isinstance(bot._conflict_detector, ConflictDetector)
