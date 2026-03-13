"""Bot command definitions shared across layers.

Commands are ordered by usage frequency (most used first).
Descriptions are kept ≤22 chars so mobile clients don't truncate.
"""

from __future__ import annotations

import logging
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

# -- Core commands (every agent, shown in Telegram popup) ------------------
# Sorted by typical usage: daily actions → power-user → rare maintenance.

BOT_COMMANDS: list[tuple[str, str]] = [
    # Daily
    ("new", "Start new chat"),
    ("stop", "Stop running agent"),
    ("interrupt", "Soft interrupt (ESC)"),
    ("model", "Show/switch model"),
    ("think", "Set thinking level"),
    ("compact", "Compress session"),
    ("status", "Session info"),
    ("memory", "Show main memory"),
    # Automation & multi-agent
    ("session", "Background sessions"),
    ("tasks", "Background tasks"),
    ("cron", "Manage cron jobs"),
    ("agent_commands", "Multi-agent system"),
    # Browse & info
    ("where", "Tracked chats"),
    ("leave", "Leave a group"),
    ("showfiles", "Browse files"),
    ("hooks", "Message hooks"),
    ("info", "Docs, links & about"),
    ("help", "Show all commands"),
    # Maintenance (rare)
    ("diagnose", "System diagnostics"),
    ("upgrade", "Check for updates"),
    ("restart", "Restart bot"),
    ("pair", "Generate pairing code"),
]

# Commands shown in group/supergroup chats — admin/maintenance commands filtered out.
_GROUP_EXCLUDED: frozenset[str] = frozenset(
    {"diagnose", "upgrade", "restart", "agent_commands", "pair"}
)

GROUP_COMMANDS: list[tuple[str, str]] = [
    (cmd, desc) for cmd, desc in BOT_COMMANDS if cmd not in _GROUP_EXCLUDED
]

# Sub-commands registered as handlers but NOT shown in the Telegram popup.
# Users discover them via /agent_commands or /help.
MULTIAGENT_SUB_COMMANDS: list[tuple[str, str]] = [
    ("agents", "List all agents"),
    ("agent_start", "Start a sub-agent"),
    ("agent_stop", "Stop a sub-agent"),
    ("agent_restart", "Restart a sub-agent"),
    ("stop_all", "Stop all agents"),
]

# -- Built-in command names (used to avoid duplicates with skills) ----------
_BUILTIN_COMMANDS: frozenset[str] = frozenset(
    cmd for cmd, _ in BOT_COMMANDS + MULTIAGENT_SUB_COMMANDS
)

# Telegram command description limit.
_MAX_DESC_LEN = 64


def _truncate(text: str, limit: int = _MAX_DESC_LEN) -> str:
    """Truncate *text* to *limit* chars, adding ellipsis if needed."""
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _parse_skill_frontmatter(skill_md: Path) -> tuple[str, str] | None:
    """Extract ``(name, description)`` from a SKILL.md frontmatter block."""
    try:
        raw = skill_md.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    if not raw.startswith("---"):
        return None
    end = raw.find("---", 3)
    if end == -1:
        return None
    try:
        meta = yaml.safe_load(raw[3:end])
    except yaml.YAMLError:
        return None
    if not isinstance(meta, dict):
        return None
    name, desc = meta.get("name"), meta.get("description")
    return (str(name), str(desc)) if name and desc else None


def discover_skill_commands(skills_dir: Path) -> list[tuple[str, str]]:
    """Scan *skills_dir* and return ``(command, description)`` pairs.

    Skill names use kebab-case but Telegram commands only allow ``[a-z0-9_]``,
    so hyphens are converted to underscores.  Skills whose converted name
    collides with a built-in command are skipped.
    """
    if not skills_dir.is_dir():
        return []
    results: list[tuple[str, str]] = []
    for entry in sorted(skills_dir.iterdir()):
        if entry.name.startswith(".") or not (entry.is_dir() or entry.is_symlink()):
            continue
        skill_md = entry / "SKILL.md"
        if not skill_md.exists():
            continue
        parsed = _parse_skill_frontmatter(skill_md)
        if parsed is None:
            continue
        name, desc = parsed
        command = name.replace("-", "_")
        if command in _BUILTIN_COMMANDS:
            continue
        results.append((command, _truncate(desc)))
    return results
