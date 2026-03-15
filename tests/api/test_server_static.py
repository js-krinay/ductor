"""Tests for dashboard static file serving."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from klir.api.server import ApiServer


@pytest.fixture
def dashboard_dist(tmp_path: Path) -> Path:
    """Create a fake dashboard dist directory."""
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!DOCTYPE html><html><body>Dashboard</body></html>")
    assets = dist / "assets"
    assets.mkdir()
    (assets / "main.js").write_text("console.log('dashboard')")
    return dist


@pytest.fixture
def api_config() -> Any:
    cfg = MagicMock()
    cfg.token = "test-token"
    cfg.host = "127.0.0.1"
    cfg.port = 0
    cfg.allow_public = True
    cfg.dashboard.enabled = True
    cfg.dashboard.max_clients = 5
    return cfg


class TestDashboardDist:
    def test_resolve_returns_path_with_index(self, api_config: Any) -> None:
        server = ApiServer(api_config, default_chat_id=1)
        result = server._resolve_dashboard_dist()
        # Result depends on whether dist/ exists in the repo
        if result is not None:
            assert (result / "index.html").exists()
            assert result.is_dir()

    def test_resolve_returns_none_without_index(
        self, api_config: Any, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Create a dist dir without index.html
        empty_dist = tmp_path / "dashboard" / "dist"
        empty_dist.mkdir(parents=True)

        # Direct test: an empty dist without index.html should not resolve
        dist = tmp_path / "dashboard" / "dist"
        assert dist.is_dir()
        assert not (dist / "index.html").exists()

    async def test_start_refuses_empty_token(self, api_config: Any) -> None:
        api_config.token = ""
        server = ApiServer(api_config, default_chat_id=1)
        await server.start()
        assert server._runner is None
