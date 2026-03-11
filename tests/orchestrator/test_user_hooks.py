"""Tests for user-defined hook evaluation."""

from __future__ import annotations

from klir.config import UserMessageHookConfig
from klir.orchestrator.hooks import HookContext
from klir.orchestrator.user_hooks import UserHookEvaluator


def _ctx(*, provider: str = "claude") -> HookContext:
    return HookContext(
        chat_id=1,
        message_count=0,
        is_new_session=False,
        provider=provider,
        model="opus",
    )


class TestPrePhaseHooks:
    def test_prepend_always(self) -> None:
        hooks = [
            UserMessageHookConfig(
                name="prefix",
                phase="pre",
                action="prepend",
                text="[BOT] ",
            )
        ]
        ev = UserHookEvaluator(hooks)
        result = ev.apply_pre("hello", _ctx())
        assert result == "[BOT] hello"

    def test_append_always(self) -> None:
        hooks = [
            UserMessageHookConfig(
                name="suffix",
                phase="pre",
                action="append",
                text=" [end]",
            )
        ]
        ev = UserHookEvaluator(hooks)
        result = ev.apply_pre("hello", _ctx())
        assert result == "hello [end]"

    def test_regex_condition_matches(self) -> None:
        hooks = [
            UserMessageHookConfig(
                name="code",
                phase="pre",
                action="prepend",
                text="CODE: ",
                condition="regex",
                pattern=r"^/code\b",
            )
        ]
        ev = UserHookEvaluator(hooks)
        assert ev.apply_pre("/code print hello", _ctx()) == "CODE: /code print hello"
        assert ev.apply_pre("normal message", _ctx()) == "normal message"

    def test_provider_condition_matches(self) -> None:
        hooks = [
            UserMessageHookConfig(
                name="claude-only",
                phase="pre",
                action="prepend",
                text="CLAUDE: ",
                condition="provider",
                provider="claude",
            )
        ]
        ev = UserHookEvaluator(hooks)
        assert ev.apply_pre("hi", _ctx(provider="claude")) == "CLAUDE: hi"
        assert ev.apply_pre("hi", _ctx(provider="codex")) == "hi"

    def test_disabled_hook_skipped(self) -> None:
        hooks = [
            UserMessageHookConfig(
                name="off",
                phase="pre",
                action="prepend",
                text="X",
                enabled=False,
            )
        ]
        ev = UserHookEvaluator(hooks)
        assert ev.apply_pre("hello", _ctx()) == "hello"

    def test_multiple_hooks_chain(self) -> None:
        hooks = [
            UserMessageHookConfig(name="a", phase="pre", action="prepend", text="A:"),
            UserMessageHookConfig(name="b", phase="pre", action="append", text=":B"),
        ]
        ev = UserHookEvaluator(hooks)
        assert ev.apply_pre("msg", _ctx()) == "A:msg:B"


class TestPostPhaseHooks:
    def test_append_to_response(self) -> None:
        hooks = [
            UserMessageHookConfig(
                name="footer",
                phase="post",
                action="append",
                text="\n---\nPowered by klir",
            )
        ]
        ev = UserHookEvaluator(hooks)
        result = ev.apply_post("AI response here", _ctx())
        assert result == "AI response here\n---\nPowered by klir"

    def test_post_hooks_ignore_pre_hooks(self) -> None:
        hooks = [
            UserMessageHookConfig(name="pre", phase="pre", action="prepend", text="X"),
            UserMessageHookConfig(name="post", phase="post", action="append", text="Y"),
        ]
        ev = UserHookEvaluator(hooks)
        assert ev.apply_post("response", _ctx()) == "responseY"


class TestEmptyEvaluator:
    def test_no_hooks_passthrough(self) -> None:
        ev = UserHookEvaluator([])
        assert ev.apply_pre("hello", _ctx()) == "hello"
        assert ev.apply_post("hello", _ctx()) == "hello"


class TestInvalidRegex:
    def test_invalid_regex_does_not_crash(self) -> None:
        """A hook with a broken regex pattern is silently skipped; no exception raised."""
        hooks = [
            UserMessageHookConfig(
                name="broken",
                phase="pre",
                action="prepend",
                text="X: ",
                condition="regex",
                pattern="[invalid",
            )
        ]
        ev = UserHookEvaluator(hooks)
        # Should not raise; the hook is excluded due to invalid pattern.
        result = ev.apply_pre("hello", _ctx())
        assert result == "hello"

    def test_invalid_regex_returns_false_does_not_modify_text(self) -> None:
        """Text is unchanged when the only matching hook has an invalid regex."""
        hooks = [
            UserMessageHookConfig(
                name="bad-pattern",
                phase="pre",
                action="append",
                text=" EXTRA",
                condition="regex",
                pattern="(unclosed",
            )
        ]
        ev = UserHookEvaluator(hooks)
        assert ev.apply_pre("test message", _ctx()) == "test message"

    def test_valid_regex_still_works_after_precompilation(self) -> None:
        """Pre-compiled valid patterns continue to match correctly."""
        hooks = [
            UserMessageHookConfig(
                name="code-block",
                phase="pre",
                action="prepend",
                text="CODE: ",
                condition="regex",
                pattern=r"```",
            )
        ]
        ev = UserHookEvaluator(hooks)
        assert ev.apply_pre("```python\nprint(1)\n```", _ctx()) == "CODE: ```python\nprint(1)\n```"
        assert ev.apply_pre("plain text", _ctx()) == "plain text"

    def test_mixed_valid_invalid_regex_hooks(self) -> None:
        """Valid hooks fire normally even when a preceding hook has an invalid regex."""
        hooks = [
            UserMessageHookConfig(
                name="broken",
                phase="pre",
                action="prepend",
                text="BROKEN: ",
                condition="regex",
                pattern="[bad",
            ),
            UserMessageHookConfig(
                name="valid",
                phase="pre",
                action="append",
                text=" [ok]",
                condition="regex",
                pattern=r"\bhello\b",
            ),
        ]
        ev = UserHookEvaluator(hooks)
        result = ev.apply_pre("hello world", _ctx())
        assert result == "hello world [ok]"

    def test_invalid_regex_hook_excluded_from_compiled(self) -> None:
        """A hook with an invalid regex is absent from the compiled-patterns dict."""
        hooks = [
            UserMessageHookConfig(
                name="bad",
                phase="pre",
                action="prepend",
                text="X",
                condition="regex",
                pattern="[broken",
            )
        ]
        ev = UserHookEvaluator(hooks)
        assert "bad" not in ev._compiled
