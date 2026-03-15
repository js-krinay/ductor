"""API server management CLI subcommands (``klir api ...``)."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from klir.workspace.paths import resolve_paths

_console = Console()

_API_SUBCOMMANDS = frozenset({"token"})


def _parse_api_subcommand(args: list[str]) -> str | None:
    """Extract the subcommand after 'api' from CLI args."""
    found = False
    for a in args:
        if a.startswith("-"):
            continue
        if not found and a == "api":
            found = True
            continue
        if found:
            return a if a in _API_SUBCOMMANDS else None
    return None


def print_api_help() -> None:
    """Print the API subcommand help table with current status."""
    _console.print()
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="bold green", min_width=30)
    table.add_column()
    table.add_row("klir api token", "Show your API token and dashboard URL")

    # Show current status
    paths = resolve_paths()
    status = "[dim]not configured[/dim]"
    if paths.config_path.exists():
        try:
            data = json.loads(paths.config_path.read_text(encoding="utf-8"))
            api_cfg = data.get("api", {})
            if isinstance(api_cfg, dict) and api_cfg.get("enabled"):
                port = api_cfg.get("port", 8741)
                status = f"[green]enabled[/green] (port {port})"
            elif isinstance(api_cfg, dict):
                status = "[dim]disabled[/dim]"
        except (json.JSONDecodeError, OSError):
            pass

    _console.print(
        Panel(
            table,
            title="[bold]API Commands[/bold] [dim](beta)[/dim]",
            border_style="blue",
            padding=(1, 0),
        ),
    )
    _console.print(f"  Status: {status}")
    _console.print()


def _read_config() -> tuple[Path, dict[str, object]] | None:
    """Read the config file and return (path, data) or None on failure."""
    paths = resolve_paths()
    config_path = paths.config_path
    if not config_path.exists():
        _console.print("[red]Config file not found. Run klir first.[/red]")
        return None
    try:
        data: dict[str, object] = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        _console.print("[red]Failed to read config file.[/red]")
        return None
    return config_path, data


def api_token() -> None:
    """Display the current API token and dashboard URL."""
    result = _read_config()
    if result is None:
        return
    _config_path, data = result

    api = data.get("api", {})
    if not isinstance(api, dict):
        api = {}
    token = api.get("token", "")
    if not token:
        _console.print("[dim]No API token configured. Run [bold]klir[/bold] to set up.[/dim]")
        return

    port = api.get("port", 8741)
    ts_cfg = api.get("tailscale", {})
    ts_mode = ts_cfg.get("mode", "off") if isinstance(ts_cfg, dict) else "off"

    lines = [f"  Token:      [cyan]{token}[/cyan]"]

    if ts_mode in ("serve", "funnel"):
        lines.append(f"  Local URL:  [cyan]http://localhost:{port}/dashboard/[/cyan]")
        lines.append(
            f"  Tailscale:  [green]{ts_mode}[/green] [dim](HTTPS URL shown at startup)[/dim]"
        )
    else:
        lines.append(f"  URL:        [cyan]http://localhost:{port}/dashboard/[/cyan]")

    _console.print(
        Panel(
            "\n".join(lines),
            title="[bold]API Access[/bold]",
            border_style="blue",
            padding=(1, 2),
        ),
    )


def cmd_api(args: list[str]) -> None:
    """Handle 'klir api <subcommand>'."""
    sub = _parse_api_subcommand(args)
    if sub is None:
        print_api_help()
        return

    dispatch: dict[str, Callable[[], None]] = {
        "token": api_token,
    }
    _console.print()
    dispatch[sub]()
    _console.print()
