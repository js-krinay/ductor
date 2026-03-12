# Quality Hardening & CHANGELOG Design

**Date:** 2026-03-12
**Goal:** Zero ruff violations, zero mypy errors, auto-generated CHANGELOG.

---

## Workstream 1: Ruff Lint Cleanup (86 violations → 0)

### Phase 1 — Auto-fixable (57 violations)

Run `ruff check --fix .` and `ruff check --fix --unsafe-fixes .` to clear:
- `F401` × 39 — unused imports
- `I001` × 18 — unsorted import blocks

Verify tests pass after.

### Phase 2 — Simple manual fixes (~10 violations)

- `N806` × 6 — Rename uppercase variables in test `with patch(...) as MockFoo:` to `mock_foo`
- `SIM102` × 1 — Merge nested `if` in `middleware.py:160`
- `E402` × 1 — Move import in `config.py:13` above module-level code
- `C123` × 2 — Unnecessary `dict.items()` comprehension

### Phase 3 — Complexity refactors (~6 violations)

| File | Rule | Fix |
|------|------|-----|
| `bot/app.py` | PLR0915 (62 stmts) | Extract observer setup into `_init_observers()` |
| `bot/startup.py` | PLR0915 (54 stmts) | Extract into `_init_orchestrator()` + `_init_sentinels()` |
| `bot/middleware.py` | C901/PLR0911/PLR0912 | Extract guards into `_check_auth()`, `_check_pairing()`, `_check_group_mention()` |
| `bot/middleware.py` | PLR0913 (8 args) | Bundle into `MiddlewareConfig` dataclass |
| `bot/sender.py` | PLR0913 (6 args) | Group related params into config object |
| `bot/streaming.py` | PLR0913 (6 args) | Same pattern |

Each refactor preserves behavior. Tests run after each file.

---

## Workstream 2: Mypy Strict Cleanup (28 errors → 0)

| File | Errors | Fix |
|------|--------|-----|
| `forward_context.py` | 22 | `isinstance` narrowing on `MessageOrigin` union subtypes |
| `app.py` | 4 | Fix `KlirPaths` attr/arg types, cast `BotCommandScope` |
| `middleware.py` | 1 | Narrow `_pairing_svc` from `object` to actual type |
| `response_format.py` | 1 | Rename duplicate `timeout_error_text` function |

---

## Workstream 3: CHANGELOG (auto-generated)

- Iterate tags v0.1.0 → v0.5.1 via `git log --oneline` between each pair
- Parse conventional commit prefixes → group by Features/Fixes/Refactoring/Other
- Filter noise (version bump commits, merge commits)
- Output Keep a Changelog format with dates from tag objects
- Result: `CHANGELOG.md` at repo root

---

## Execution Order

1. Ruff Phase 1 (auto-fix) — safe, instant
2. Ruff Phase 2 (simple manual) — low risk
3. Mypy fixes — 4 files, isolated
4. Ruff Phase 3 (complexity refactors) — highest risk, careful testing
5. CHANGELOG generation — independent

Each phase gets its own commit. Full test suite between phases.
