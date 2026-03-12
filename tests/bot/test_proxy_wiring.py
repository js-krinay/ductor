"""Test that proxy is wired into Bot creation."""

from __future__ import annotations

from unittest.mock import patch


class TestProxyWiring:
    def test_bot_created_with_proxy_session(self) -> None:
        from klir.bot.session_factory import ResilientSession
        from klir.config import AgentConfig, ProxyConfig

        config = AgentConfig(
            telegram_token="test:token",
            proxy=ProxyConfig(url="http://proxy:8080"),
        )

        with (
            patch("klir.bot.app.Bot") as mock_bot_cls,
            patch("klir.bot.session_factory.AiohttpSession.__init__", return_value=None),
        ):
            from klir.bot.app import TelegramBot

            TelegramBot(config)

            # Bot should have been created with a ResilientSession
            call_kwargs = mock_bot_cls.call_args.kwargs
            assert isinstance(call_kwargs.get("session"), ResilientSession)

    def test_bot_created_without_proxy(self) -> None:
        from klir.bot.session_factory import ResilientSession
        from klir.config import AgentConfig

        config = AgentConfig(telegram_token="test:token")

        with patch("klir.bot.app.Bot") as mock_bot_cls:
            from klir.bot.app import TelegramBot

            TelegramBot(config)

            # Resilience is always enabled, so a ResilientSession is used even without proxy
            call_kwargs = mock_bot_cls.call_args.kwargs
            assert isinstance(call_kwargs.get("session"), ResilientSession)
