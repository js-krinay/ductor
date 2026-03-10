"""Test that proxy is wired into Bot creation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


class TestProxyWiring:
    def test_bot_created_with_proxy_session(self) -> None:
        from ductor_bot.config import AgentConfig, ProxyConfig

        config = AgentConfig(
            telegram_token="test:token",
            proxy=ProxyConfig(url="http://proxy:8080"),
        )

        with (
            patch("ductor_bot.bot.app.Bot") as MockBot,
            patch("ductor_bot.bot.session_factory.AiohttpSession") as MockSession,
        ):
            mock_session = MagicMock()
            MockSession.return_value = mock_session

            from ductor_bot.bot.app import TelegramBot

            bot = TelegramBot(config)

            # Bot should have been created with session kwarg
            call_kwargs = MockBot.call_args.kwargs
            assert call_kwargs.get("session") is mock_session

    def test_bot_created_without_proxy(self) -> None:
        from ductor_bot.config import AgentConfig

        config = AgentConfig(telegram_token="test:token")

        with patch("ductor_bot.bot.app.Bot") as MockBot:
            from ductor_bot.bot.app import TelegramBot

            bot = TelegramBot(config)

            call_kwargs = MockBot.call_args.kwargs
            assert call_kwargs.get("session") is None
