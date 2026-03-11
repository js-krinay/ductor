"""Tests for SessionKey with peer isolation (user_id)."""

from __future__ import annotations

from klir.session.key import SessionKey


def test_key_without_user_id() -> None:
    k = SessionKey(chat_id=1)
    assert k.user_id is None
    assert k.storage_key == "1"


def test_key_with_user_id() -> None:
    k = SessionKey(chat_id=1, user_id=42)
    assert k.user_id == 42
    assert k.storage_key == "1:u42"


def test_key_with_topic_and_user() -> None:
    k = SessionKey(chat_id=1, topic_id=5, user_id=42)
    assert k.storage_key == "1:5:u42"


def test_lock_key_includes_user_id() -> None:
    k = SessionKey(chat_id=1, user_id=42)
    assert k.lock_key == (1, None, 42)


def test_parse_key_with_user_id() -> None:
    k = SessionKey.parse("1:u42")
    assert k.chat_id == 1
    assert k.user_id == 42
    assert k.topic_id is None


def test_parse_key_with_topic_and_user() -> None:
    k = SessionKey.parse("1:5:u42")
    assert k.chat_id == 1
    assert k.topic_id == 5
    assert k.user_id == 42


def test_parse_legacy_key_no_user() -> None:
    k = SessionKey.parse("1")
    assert k.user_id is None

    k2 = SessionKey.parse("1:5")
    assert k2.user_id is None
