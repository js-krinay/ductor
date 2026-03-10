"""Factory for aiogram Bot sessions with optional proxy support."""

from __future__ import annotations

import logging

from aiogram.client.session.aiohttp import AiohttpSession

from ductor_bot.infra.proxy import sanitize_proxy_url

logger = logging.getLogger(__name__)


def create_bot_session(proxy_url: str | None) -> AiohttpSession | None:
    """Create an aiogram AiohttpSession with proxy, or None for default."""
    if not proxy_url:
        return None

    logger.info("Creating proxied bot session: %s", sanitize_proxy_url(proxy_url))
    return AiohttpSession(proxy=proxy_url)
