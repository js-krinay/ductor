# Quality Hardening & CHANGELOG Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Zero ruff violations, zero mypy errors, auto-generated CHANGELOG.md.

**Architecture:** Three independent workstreams. Ruff cleanup progresses from safe auto-fixes through manual fixes to complexity refactors. Mypy cleanup narrows union types and fixes attr misuse. CHANGELOG auto-generates from git tag history with conventional commit parsing. Each task has its own commit; full test suite runs between tasks.

**Tech Stack:** Python 3.11+, ruff, mypy (strict), pytest, aiogram 3.x, Pydantic 2.x

---

## Task 1: Ruff Auto-Fix (57 violations)

**Files:**
- Modify: ~30 files across `klir/` and `tests/` (auto-fixed by ruff)

**Step 1: Run ruff auto-fix**

```bash
uv run ruff check --fix .
```

Expected: Fixes `F401` (unused imports) and `I001` (import sorting) violations.

**Step 2: Run ruff unsafe auto-fix**

```bash
uv run ruff check --fix --unsafe-fixes .
```

Expected: Fixes `F841` (unused variables) by prefixing with `_`.

**Step 3: Run test suite**

```bash
uv run pytest -x -q
```

Expected: 3438+ tests PASS.

**Step 4: Verify remaining violations**

```bash
uv run ruff check . --output-format json | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d), 'remaining')"
```

Expected: ~29 violations remaining (the manual ones).

**Step 5: Commit**

```bash
git add -u
git commit -m "style: Auto-fix ruff lint violations (F401, I001, F841)"
```

---

## Task 2: Ruff Manual Fixes — Simple (10 violations)

**Files:**
- Modify: `klir/config.py:11-13`
- Modify: `klir/infra/process_tree.py:88-91`
- Modify: `tests/bot/test_command_sync.py:17,44`
- Modify: `tests/bot/test_proxy_wiring.py:19,36`
- Modify: `tests/bot/test_resilient_session.py:40`
- Modify: `tests/bot/test_session_factory.py:20`
- Modify: `tests/config/test_reaction_config.py:25`

**Step 1: Fix E402 in `klir/config.py`**

Move the `ReplyToMode` type alias below the pydantic import so all imports are at the top.

In `klir/config.py`, change lines 8-13 from:
```python
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ReplyToMode = Literal["off", "first", "all"]

from pydantic import BaseModel, Field, field_validator, model_validator
```

To:
```python
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator, model_validator

ReplyToMode = Literal["off", "first", "all"]
```

**Step 2: Fix TRY300 in `klir/infra/process_tree.py`**

In `klir/infra/process_tree.py`, the `return True` at line 90 is inside a `try` block. Move it to an `else` block. Change lines 88-96 from:
```python
    try:
        os.kill(pid, sig)
        return True
    except ProcessLookupError:
        logger.debug("interrupt_process: pid=%d already exited", pid)
        return False
    except (PermissionError, OSError):
        logger.warning("interrupt_process: failed to send SIGINT to pid=%d", pid, exc_info=True)
        return False
```

To:
```python
    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        logger.debug("interrupt_process: pid=%d already exited", pid)
        return False
    except (PermissionError, OSError):
        logger.warning("interrupt_process: failed to send SIGINT to pid=%d", pid, exc_info=True)
        return False
    else:
        return True
```

**Step 3: Fix N806 in test files**

In each test file, rename uppercase `MockBot`/`MockSession` patch aliases to lowercase:

- `tests/bot/test_command_sync.py:17` — `as MockBot:` → `as mock_bot:` (and all references within the block)
- `tests/bot/test_command_sync.py:44` — same pattern
- `tests/bot/test_proxy_wiring.py:19` — `as MockBot:` → `as mock_bot:`
- `tests/bot/test_proxy_wiring.py:36` — same
- `tests/bot/test_resilient_session.py:40` — `as MockSession:` → `as mock_session:`
- `tests/bot/test_session_factory.py:20` — `as MockSession:` → `as mock_session:`

For each file: find every reference to the old name within the same function and rename them too.

**Step 4: Fix PT011 in `tests/config/test_reaction_config.py:25`**

Change:
```python
        with pytest.raises(ValueError):
```
To:
```python
        with pytest.raises(ValueError, match="validation error"):
```

Check the actual error message first by running:
```bash
uv run python3 -c "from klir.config import ReactionConfig; ReactionConfig(level='invalid')"
```

Then use the appropriate match string from the error output.

**Step 5: Fix SIM102 in `klir/bot/middleware.py:160`**

Change lines 160-161 from:
```python
                if self._pairing_svc and text:
                    if self._pairing_svc.validate(text, user_id=user.id):
```
To:
```python
                if self._pairing_svc and text and self._pairing_svc.validate(text, user_id=user.id):
```

**Step 6: Run test suite and ruff**

```bash
uv run pytest -x -q && uv run ruff check klir/config.py klir/infra/process_tree.py klir/bot/middleware.py tests/bot/test_command_sync.py tests/bot/test_proxy_wiring.py tests/bot/test_resilient_session.py tests/bot/test_session_factory.py tests/config/test_reaction_config.py
```

Expected: PASS, zero violations for these files.

**Step 7: Commit**

```bash
git add klir/config.py klir/infra/process_tree.py klir/bot/middleware.py tests/bot/test_command_sync.py tests/bot/test_proxy_wiring.py tests/bot/test_resilient_session.py tests/bot/test_session_factory.py tests/config/test_reaction_config.py
git commit -m "style: Fix manual ruff violations (E402, N806, SIM102, TRY300, PT011)"
```

---

## Task 3: Mypy Fix — `response_format.py` (F811 + duplicate removal)

**Files:**
- Modify: `klir/text/response_format.py:127-139`

Lines 127-139 are an exact duplicate of lines 61-73 (both `TIMEOUT_ERROR_TEXT` constant and `timeout_error_text` function). The second copy shadows the first.

**Step 1: Delete the duplicate block**

Remove lines 127-139 (the second `TIMEOUT_ERROR_TEXT` and second `timeout_error_text`). Keep lines 61-73 (the first copy).

**Step 2: Run tests and checks**

```bash
uv run pytest -x -q && uv run ruff check klir/text/response_format.py && uv run mypy klir/text/response_format.py
```

Expected: PASS, zero ruff violations, zero mypy errors for this file.

**Step 3: Commit**

```bash
git add klir/text/response_format.py
git commit -m "fix: Remove duplicate timeout_error_text definition"
```

---

## Task 4: Mypy Fix — `forward_context.py` (22 union-attr errors)

**Files:**
- Modify: `klir/bot/forward_context.py:14-44`

The function accesses union-type-specific attributes without `isinstance` narrowing. The aiogram `MessageOrigin` union has subtypes: `MessageOriginUser`, `MessageOriginHiddenUser`, `MessageOriginChat`, `MessageOriginChannel`.

**Step 1: Rewrite `extract_forward_context` with proper narrowing**

Replace lines 1-44 with:

```python
"""Extract forward origin metadata from inbound Telegram messages."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aiogram.types import Message

logger = logging.getLogger(__name__)


def extract_forward_context(message: Message) -> str | None:
    """Build a context string from a forwarded message's origin metadata.

    Returns ``None`` when the message is not forwarded.
    """
    from aiogram.types import (
        MessageOriginChannel,
        MessageOriginChat,
        MessageOriginHiddenUser,
        MessageOriginUser,
    )

    origin = message.forward_origin
    if origin is None:
        return None

    date_str = origin.date.isoformat() if origin.date else "unknown"

    if isinstance(origin, MessageOriginUser):
        name = origin.sender_user.full_name
        uid = origin.sender_user.id
        return f"[Forwarded from {name} (user {uid}) at {date_str}]"
    if isinstance(origin, MessageOriginChannel):
        title = origin.chat.title
        cid = origin.chat.id
        mid = origin.message_id
        return f'[Forwarded from channel "{title}" (chat {cid}, message {mid}) at {date_str}]'
    if isinstance(origin, MessageOriginHiddenUser):
        name = origin.sender_user_name
        return f"[Forwarded from {name} (hidden user) at {date_str}]"
    if isinstance(origin, MessageOriginChat):
        title = origin.sender_chat.title if origin.sender_chat else "unknown"
        return f'[Forwarded from chat "{title}" at {date_str}]'
    return f"[Forwarded message at {date_str}]"


def prepend_forward_context(context: str, text: str) -> str:
    """Prepend forward context to the resolved prompt text."""
    return f"{context}\n\n{text}"
```

**Step 2: Run tests and mypy**

```bash
uv run pytest tests/bot/test_forward_context.py -v && uv run mypy klir/bot/forward_context.py
```

Expected: PASS, zero mypy errors.

**Step 3: Commit**

```bash
git add klir/bot/forward_context.py
git commit -m "fix(bot): Add isinstance narrowing for MessageOrigin union types"
```

---

## Task 5: Mypy Fix — `app.py` (4 errors)

**Files:**
- Modify: `klir/bot/app.py:412` (KlirPaths usage)
- Modify: `klir/bot/app.py:1533` (scope typing)

**Step 1: Fix KlirPaths usage at line 412**

`KlirPaths` expects a `Path` argument and has `.config_path` not `.config_json`.

Change line 412 from:
```python
            config_path = KlirPaths(self._config.klir_home).config_json
```
To:
```python
            config_path = KlirPaths(Path(self._config.klir_home)).config_path
```

Add `from pathlib import Path` to the imports if not already present (check first — it's likely already imported).

**Step 2: Fix scope typing at line 1533**

Change line 1533 from:
```python
        scopes: list[tuple[object, list[BotCommand]]] = [
```
To:
```python
        scopes: list[tuple[BotCommandScopeAllPrivateChats | BotCommandScopeAllGroupChats, list[BotCommand]]] = [
```

This makes mypy understand the exact scope types being passed to `get_my_commands` and `set_my_commands`.

**Step 3: Run tests and mypy**

```bash
uv run pytest tests/bot/ -x -q && uv run mypy klir/bot/app.py
```

Expected: PASS, zero mypy errors for this file.

**Step 4: Commit**

```bash
git add klir/bot/app.py
git commit -m "fix(bot): Fix KlirPaths and BotCommandScope type errors"
```

---

## Task 6: Mypy Fix — `middleware.py` (1 error)

**Files:**
- Modify: `klir/bot/middleware.py:96-104`

The `pairing_svc` parameter is typed as `object | None`. Mypy can't see `.validate()` on `object`.

**Step 1: Create a Protocol for the pairing service**

At the top of `klir/bot/middleware.py`, before the `AuthMiddleware` class, add a Protocol:

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class PairingValidator(Protocol):
    def validate(self, code: str, *, user_id: int) -> bool: ...
```

Wait — check the actual signature of `PairingService.validate`:
```python
def validate(self, code: str, user_id: int) -> bool:
```

It uses positional `user_id`, but it's called as `self._pairing_svc.validate(text, user_id=user.id)` (keyword). So the Protocol should accept both:

```python
class PairingValidator(Protocol):
    def validate(self, code: str, user_id: int) -> bool: ...
```

**Step 2: Change the type annotation**

Change line 104 from:
```python
        pairing_svc: object | None = None,
```
To:
```python
        pairing_svc: PairingValidator | None = None,
```

**Step 3: Run tests and mypy**

```bash
uv run pytest tests/bot/test_middleware.py -v && uv run mypy klir/bot/middleware.py
```

Expected: PASS, zero mypy errors.

**Step 4: Commit**

```bash
git add klir/bot/middleware.py
git commit -m "fix(bot): Type pairing_svc with Protocol instead of object"
```

---

## Task 7: Ruff Complexity Refactor — `bot/middleware.py`

**Files:**
- Modify: `klir/bot/middleware.py:88-177`
- Test: `tests/bot/test_middleware.py`

The `AuthMiddleware.__init__` has PLR0913 (8 args) and `__call__` has C901 (complexity 18), PLR0911 (9 returns), PLR0912 (18 branches).

**Step 1: Create `AuthMiddlewareConfig` dataclass**

Above the `AuthMiddleware` class, add:

```python
@dataclass(frozen=True, slots=True)
class AuthMiddlewareConfig:
    """Bundled configuration for AuthMiddleware."""

    allowed_user_ids: set[int]
    allowed_group_ids: set[int] = field(default_factory=set)
    allowed_channel_ids: set[int] = field(default_factory=set)
    on_rejected: RejectedCallback | None = None
    resolver: ChatConfigResolver | None = None
    pairing_svc: PairingValidator | None = None
    on_unknown_dm: Callable[[int, Message], Awaitable[None]] | None = None
    on_paired: Callable[[int], Awaitable[None]] | None = None
```

Import `field` from `dataclasses` (already imported for `@dataclass`).

**Step 2: Refactor `__init__` to accept config**

```python
    def __init__(self, cfg: AuthMiddlewareConfig) -> None:
        self._allowed_users = cfg.allowed_user_ids
        self._allowed_groups = cfg.allowed_group_ids
        self._allowed_channels = cfg.allowed_channel_ids
        self._on_rejected = cfg.on_rejected
        self._resolver = cfg.resolver
        self._pairing_svc = cfg.pairing_svc
        self._on_unknown_dm = cfg.on_unknown_dm
        self._on_paired = cfg.on_paired
```

**Step 3: Extract helper methods from `__call__`**

Break `__call__` into:

```python
    def _extract_user_and_chat(
        self, event: TelegramObject
    ) -> tuple[Any, Any, str | None] | None:
        """Extract user, chat, and chat_type. Returns None if event should pass through."""
        ...

    async def _handle_channel_post(self, event: Message, handler, data) -> Any | None:
        """Handle channel posts with no from_user."""
        ...

    async def _handle_group(self, user, chat, chat_type, handler, event, data) -> Any | None:
        """Handle group/supergroup auth."""
        ...

    async def _handle_private_unknown(self, user, event: Message) -> None:
        """Handle unknown private user — pairing flow."""
        ...
```

The exact decomposition depends on what reduces complexity below the thresholds. The key insight: the `__call__` method has 5 conceptual blocks: (1) extract user, (2) handle channel post, (3) handle group auth, (4) handle private unknown + pairing, (5) check per-chat enabled. Each becomes a helper.

**Step 4: Update all callers in `app.py`**

Every place that constructs `AuthMiddleware(allowed, ...)` needs to change to `AuthMiddleware(AuthMiddlewareConfig(allowed_user_ids=allowed, ...))`.

Search for `AuthMiddleware(` in `klir/bot/app.py` and update each call site (lines 228, 239, 242).

**Step 5: Update test fixtures**

In `tests/bot/test_middleware.py`, update all `AuthMiddleware` constructors to use `AuthMiddlewareConfig`.

**Step 6: Run tests and ruff**

```bash
uv run pytest tests/bot/test_middleware.py -v && uv run ruff check klir/bot/middleware.py
```

Expected: PASS, zero ruff violations for this file (C901, PLR0911, PLR0912, PLR0913 all resolved).

**Step 7: Commit**

```bash
git add klir/bot/middleware.py klir/bot/app.py tests/bot/test_middleware.py
git commit -m "refactor(bot): Extract AuthMiddlewareConfig and reduce __call__ complexity"
```

---

## Task 8: Ruff Complexity Refactor — `bot/app.py`

**Files:**
- Modify: `klir/bot/app.py:164-262`
- Test: `tests/bot/test_app.py`

`TelegramBot.__init__` has PLR0915 (62 statements, limit 50).

**Step 1: Extract `_init_middleware` method**

Move lines 191-251 (everything from `allowed = set(...)` through middleware wiring and error handler) into:

```python
    def _init_middleware(self) -> None:
        """Set up auth, sequential, and error-handling middleware."""
        ...
```

Call it at the end of `__init__`.

**Step 2: Verify statement count is ≤ 50**

Count the remaining statements in `__init__`. If still over 50, extract a second helper `_init_services` for pairing/approval/tracker/bus setup.

**Step 3: Run tests and ruff**

```bash
uv run pytest tests/bot/test_app.py -x -q && uv run ruff check klir/bot/app.py
```

Expected: PASS, PLR0915 resolved.

**Step 4: Commit**

```bash
git add klir/bot/app.py
git commit -m "refactor(bot): Extract _init_middleware to reduce __init__ statement count"
```

---

## Task 9: Ruff Complexity Refactor — `bot/startup.py`

**Files:**
- Modify: `klir/bot/startup.py:38-143`

`run_startup` has PLR0915 (54 statements, limit 50).

**Step 1: Extract `_run_recovery` helper**

Move the recovery block (lines 101-127) into a standalone async function:

```python
async def _run_recovery(bot: TelegramBot) -> None:
    """Auto-recover interrupted work from previous session."""
    from klir.infra.recovery import RecoveryPlanner
    from klir.text.response_format import recovery_notification_text
    ...
```

**Step 2: Extract `_run_startup_notification` helper**

Move the startup lifecycle detection block (lines 90-99) into:

```python
async def _run_startup_notification(bot: TelegramBot, sentinel: _RestartSentinelResult | None) -> None:
    """Detect startup kind and send notification."""
    from klir.infra.startup_state import detect_startup_kind, save_startup_state
    from klir.text.response_format import startup_notification_text
    ...
```

**Step 3: Run tests and ruff**

```bash
uv run pytest tests/bot/ -x -q && uv run ruff check klir/bot/startup.py
```

Expected: PASS, PLR0915 resolved.

**Step 4: Commit**

```bash
git add klir/bot/startup.py
git commit -m "refactor(bot): Extract recovery and notification helpers from run_startup"
```

---

## Task 10: Ruff Complexity Refactor — `bot/sender.py` and `bot/streaming.py`

**Files:**
- Modify: `klir/bot/sender.py:130`
- Modify: `klir/bot/streaming.py:157`

Both have PLR0913 (6 args, limit 5). Both are factory-style functions with `bot`, `chat_id`, and optional kwargs.

**Step 1: Fix `_send_text_chunks` in `sender.py`**

The function signature is:
```python
async def _send_text_chunks(
    bot: Bot, chat_id: int, clean_text: str, *,
    reply_to_message_id: int | None = None,
    thread_id: int | None = None,
    reply_to_mode: ReplyToMode = "first",
) -> Message | None:
```

Combine `reply_to_message_id`, `thread_id`, and `reply_to_mode` into a dataclass:

```python
@dataclass(frozen=True, slots=True)
class SendContext:
    """Thread and reply context for outbound messages."""
    reply_to_message_id: int | None = None
    thread_id: int | None = None
    reply_to_mode: ReplyToMode = "first"
```

Change signature to:
```python
async def _send_text_chunks(
    bot: Bot, chat_id: int, clean_text: str, ctx: SendContext | None = None,
) -> Message | None:
```

Update the single caller `send_rich` (in the same file) to construct `SendContext`.

**Step 2: Fix `create_stream_editor` in `streaming.py`**

Same pattern — the function has `bot`, `chat_id`, `reply_to`, `cfg`, `thread_id`, `reply_to_mode`. Group the optional kwargs into a dataclass or reuse `SendContext` if appropriate. Alternatively, since `cfg` is already a config object, fold `thread_id` and `reply_to_mode` into the existing `StreamingConfig` if they belong there.

Check what callers pass to decide the best grouping. If the callers are in `message_dispatch.py`, read that file to see how `create_stream_editor` is called.

**Step 3: Update callers**

Update every call site to use the new signatures.

**Step 4: Run tests and ruff**

```bash
uv run pytest tests/bot/ -x -q && uv run ruff check klir/bot/sender.py klir/bot/streaming.py
```

Expected: PASS, PLR0913 resolved for both files.

**Step 5: Commit**

```bash
git add klir/bot/sender.py klir/bot/streaming.py klir/bot/message_dispatch.py
git commit -m "refactor(bot): Reduce argument count in sender and streaming functions"
```

---

## Task 11: Final Ruff + Mypy Verification

**Step 1: Run ruff on entire codebase**

```bash
uv run ruff check .
```

Expected: `All checks passed!`

**Step 2: Run mypy on entire codebase**

```bash
uv run mypy klir
```

Expected: `Found 0 errors`

**Step 3: Run full test suite**

```bash
uv run pytest -x -q
```

Expected: 3438+ tests PASS.

**Step 4: Commit if any stragglers**

```bash
uv run ruff format .
git add -u
git commit -m "style: Final formatting pass"
```

---

## Task 12: Auto-Generate CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

**Step 1: Generate CHANGELOG from git tags**

Run the following script to generate the changelog:

```bash
python3 -c "
import subprocess, re
from datetime import datetime

tags = ['v0.1.0', 'v0.2.0', 'v0.3.0', 'v0.4.0', 'v0.4.2', 'v0.5.0', 'v0.5.1']

CATEGORY_MAP = {
    'feat': 'Added',
    'fix': 'Fixed',
    'refactor': 'Changed',
    'perf': 'Changed',
    'docs': 'Documentation',
    'test': 'Testing',
    'build': 'Build',
    'ci': 'Build',
}
SKIP = {'chore'}

def get_tag_date(tag):
    result = subprocess.run(
        ['git', 'log', '-1', '--format=%ai', tag],
        capture_output=True, text=True
    )
    return result.stdout.strip()[:10]

def get_commits(from_ref, to_ref):
    result = subprocess.run(
        ['git', 'log', '--oneline', f'{from_ref}..{to_ref}'],
        capture_output=True, text=True
    )
    return result.stdout.strip().split('\n') if result.stdout.strip() else []

lines = ['# Changelog\n']
lines.append('All notable changes to this project will be documented in this file.\n')
lines.append('Format based on [Keep a Changelog](https://keepachangelog.com/).\n')

for i in range(len(tags) - 1, -1, -1):
    tag = tags[i]
    date = get_tag_date(tag)
    from_ref = tags[i - 1] if i > 0 else f'{tags[0]}~20'  # first tag: 20 commits back

    commits = get_commits(from_ref, tag)
    categories = {}
    for commit in commits:
        if not commit:
            continue
        # Parse: hash type(scope): description
        m = re.match(r'[a-f0-9]+ (\w+)(?:\([^)]*\))?!?:\s+(.+)', commit)
        if not m:
            categories.setdefault('Other', []).append(commit.split(' ', 1)[1] if ' ' in commit else commit)
            continue
        ctype, desc = m.group(1), m.group(2)
        if ctype in SKIP:
            continue
        cat = CATEGORY_MAP.get(ctype, 'Other')
        categories.setdefault(cat, []).append(desc)

    lines.append(f'## [{tag}] - {date}\n')
    if not categories:
        lines.append('Initial release.\n')
    for cat in ['Added', 'Fixed', 'Changed', 'Documentation', 'Testing', 'Build', 'Other']:
        if cat in categories:
            lines.append(f'### {cat}\n')
            for desc in categories[cat]:
                lines.append(f'- {desc}')
            lines.append('')

print('\n'.join(lines))
" > CHANGELOG.md
```

**Step 2: Review the output**

```bash
cat CHANGELOG.md
```

Verify it looks reasonable — correct dates, no noise commits, proper grouping.

**Step 3: Run ruff on CHANGELOG.md**

N/A — markdown file, not Python.

**Step 4: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: Generate CHANGELOG from git history"
```

---

## Summary

| Task | Scope | Risk |
|------|-------|------|
| 1 | Ruff auto-fix (57 violations) | Low — automated |
| 2 | Ruff manual fixes (10 violations) | Low — simple renames/moves |
| 3 | Mypy: remove duplicate in response_format.py | Low — delete dead code |
| 4 | Mypy: isinstance narrowing in forward_context.py | Medium — logic touch |
| 5 | Mypy: fix KlirPaths + scope types in app.py | Low — type fixes |
| 6 | Mypy: Protocol for pairing_svc in middleware.py | Low — type annotation |
| 7 | Ruff: refactor middleware complexity | High — core auth path |
| 8 | Ruff: refactor app.py __init__ | Medium — constructor split |
| 9 | Ruff: refactor startup.py | Medium — startup sequence |
| 10 | Ruff: reduce args in sender/streaming | Medium — API change |
| 11 | Final verification | Low — just checking |
| 12 | CHANGELOG generation | Low — new file only |
