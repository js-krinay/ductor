"""Tests for CronRunLogEntry model and SQLite-backed run log operations."""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from klir.cron.run_log import (
    CronRunLogEntry,
    RunLogPage,
    append_run_log,
    cleanup_old_runs,
    migrate_jsonl_to_sqlite,
    read_run_log_page,
    save_run_output,
)
from klir.infra.db import KlirDB


@pytest.fixture
async def db(tmp_path: Path) -> AsyncIterator[KlirDB]:
    instance = KlirDB(tmp_path / "klir.db")
    await instance.open()
    yield instance
    await instance.close()


class TestCronRunLogEntry:
    def test_to_json_line_basic(self) -> None:
        entry = CronRunLogEntry(ts=1234567890.0, job_id="daily", status="success")
        line = entry.to_json_line()
        data = json.loads(line)
        assert data["ts"] == 1234567890.0
        assert data["job_id"] == "daily"
        assert data["status"] == "success"
        assert data["action"] == "finished"

    def test_to_json_line_omits_none(self) -> None:
        entry = CronRunLogEntry(ts=1.0, job_id="test")
        line = entry.to_json_line()
        data = json.loads(line)
        assert "error" not in data
        assert "summary" not in data
        assert "model" not in data

    def test_from_json_line_roundtrip(self) -> None:
        entry = CronRunLogEntry(
            ts=1234567890.0,
            job_id="daily",
            status="success",
            duration_ms=1500,
            provider="claude",
        )
        line = entry.to_json_line()
        restored = CronRunLogEntry.from_json_line(line)
        assert restored is not None
        assert restored.ts == 1234567890.0
        assert restored.job_id == "daily"
        assert restored.status == "success"
        assert restored.duration_ms == 1500
        assert restored.provider == "claude"

    def test_from_json_line_int_ts_works(self) -> None:
        line = '{"ts": 1234567890, "job_id": "daily"}'
        entry = CronRunLogEntry.from_json_line(line)
        assert entry is not None
        assert entry.ts == 1234567890
        assert entry.job_id == "daily"

    def test_from_json_line_malformed_returns_none(self) -> None:
        assert CronRunLogEntry.from_json_line("{not valid json") is None
        assert CronRunLogEntry.from_json_line("") is None
        assert CronRunLogEntry.from_json_line("null") is None
        # Missing ts
        assert CronRunLogEntry.from_json_line('{"job_id": "daily"}') is None
        # Non-numeric ts (string)
        assert CronRunLogEntry.from_json_line('{"ts": "not_a_number", "job_id": "daily"}') is None
        # Empty job_id
        assert CronRunLogEntry.from_json_line('{"ts": 1234567890.0, "job_id": ""}') is None
        # Whitespace-only job_id
        assert CronRunLogEntry.from_json_line('{"ts": 1234567890.0, "job_id": "  "}') is None
        # Missing job_id entirely
        assert CronRunLogEntry.from_json_line('{"ts": 1234567890.0}') is None


class TestAppendRunLog:
    async def test_insert_and_fetch(self, db: KlirDB) -> None:
        entry = CronRunLogEntry(ts=1.0, job_id="daily", status="success", run_id="run001")
        await append_run_log(db, entry)
        row = await db.fetch_one("SELECT * FROM cron_runs WHERE id = ?", ("run001",))
        assert row is not None
        assert row["job_id"] == "daily"
        assert row["status"] == "success"
        assert row["ts"] == 1.0

    async def test_multiple_inserts(self, db: KlirDB) -> None:
        for i in range(3):
            entry = CronRunLogEntry(ts=float(i), job_id="job", status="success", run_id=f"run{i}")
            await append_run_log(db, entry)
        row = await db.fetch_one("SELECT COUNT(*) AS cnt FROM cron_runs")
        assert row is not None
        assert row["cnt"] == 3


class TestReadRunLogPage:
    async def test_empty_db_returns_empty_page(self, db: KlirDB) -> None:
        page = await read_run_log_page(db)
        assert page.entries == []
        assert page.total == 0
        assert page.has_more is False

    async def test_desc_order(self, db: KlirDB) -> None:
        for i in range(3):
            entry = CronRunLogEntry(ts=float(i), job_id="job", status="success", run_id=f"run{i}")
            await append_run_log(db, entry)
        page = await read_run_log_page(db, sort_dir="desc")
        assert page.entries[0].ts == 2.0
        assert page.entries[-1].ts == 0.0

    async def test_status_filter(self, db: KlirDB) -> None:
        await append_run_log(
            db, CronRunLogEntry(ts=1.0, job_id="job", status="success", run_id="r1")
        )
        await append_run_log(
            db,
            CronRunLogEntry(ts=2.0, job_id="job", status="error:exit_1", run_id="r2"),
        )
        page = await read_run_log_page(db, status_filter="success")
        assert page.total == 1
        assert page.entries[0].status == "success"

    async def test_pagination_offset(self, db: KlirDB) -> None:
        for i in range(5):
            await append_run_log(
                db,
                CronRunLogEntry(ts=float(i), job_id="job", status="success", run_id=f"run{i}"),
            )
        page = await read_run_log_page(db, limit=2, offset=2)
        assert len(page.entries) == 2
        assert page.total == 5
        assert page.has_more is True

    async def test_job_id_filter(self, db: KlirDB) -> None:
        await append_run_log(
            db, CronRunLogEntry(ts=1.0, job_id="alpha", status="success", run_id="a1")
        )
        await append_run_log(
            db, CronRunLogEntry(ts=2.0, job_id="alpha", status="success", run_id="a2")
        )
        await append_run_log(
            db, CronRunLogEntry(ts=3.0, job_id="beta", status="success", run_id="b1")
        )
        page = await read_run_log_page(db, job_id="alpha")
        assert page.total == 2
        assert all(e.job_id == "alpha" for e in page.entries)

    def test_run_log_page_type(self) -> None:
        """RunLogPage is accessible from the import."""
        assert RunLogPage is not None


class TestCleanupOldRuns:
    async def test_deletes_old_entries(self, db: KlirDB) -> None:
        old_ts = time.time() - 60 * 86400  # 60 days ago
        await append_run_log(
            db, CronRunLogEntry(ts=old_ts, job_id="job", status="success", run_id="old1")
        )
        await append_run_log(
            db, CronRunLogEntry(ts=old_ts - 100, job_id="job", status="success", run_id="old2")
        )
        await cleanup_old_runs(db, max_age_days=30)
        page = await read_run_log_page(db)
        assert page.total == 0

    async def test_keeps_recent_entries(self, db: KlirDB) -> None:
        recent_ts = time.time() - 86400  # 1 day ago
        await append_run_log(
            db, CronRunLogEntry(ts=recent_ts, job_id="job", status="success", run_id="new1")
        )
        await cleanup_old_runs(db, max_age_days=30)
        page = await read_run_log_page(db)
        assert page.total == 1


class TestMigrateJsonlToSqlite:
    async def test_imports_jsonl_entries(self, db: KlirDB, tmp_path: Path) -> None:
        state_dir = tmp_path / "cron_state"
        job_dir = state_dir / "daily"
        job_dir.mkdir(parents=True)
        entries = [
            CronRunLogEntry(ts=1.0, job_id="daily", status="success", run_id="m1"),
            CronRunLogEntry(ts=2.0, job_id="daily", status="error", run_id="m2"),
        ]
        jsonl = "\n".join(e.to_json_line() for e in entries) + "\n"
        (job_dir / "runs.jsonl").write_text(jsonl)

        count = await migrate_jsonl_to_sqlite(db, state_dir)
        assert count == 2
        page = await read_run_log_page(db)
        assert page.total == 2

    async def test_idempotent_migration(self, db: KlirDB, tmp_path: Path) -> None:
        state_dir = tmp_path / "cron_state"
        job_dir = state_dir / "daily"
        job_dir.mkdir(parents=True)
        entry = CronRunLogEntry(ts=1.0, job_id="daily", status="success", run_id="idem1")
        (job_dir / "runs.jsonl").write_text(entry.to_json_line() + "\n")

        first = await migrate_jsonl_to_sqlite(db, state_dir)
        second = await migrate_jsonl_to_sqlite(db, state_dir)
        assert first == 1
        assert second == 0
        page = await read_run_log_page(db)
        assert page.total == 1

    async def test_empty_dir_returns_zero(self, db: KlirDB, tmp_path: Path) -> None:
        state_dir = tmp_path / "cron_state"
        state_dir.mkdir()
        count = await migrate_jsonl_to_sqlite(db, state_dir)
        assert count == 0


class TestSaveRunOutput:
    async def test_saves_stdout_and_stderr(self, tmp_path: Path) -> None:
        state_dir = tmp_path / "state"
        result = await save_run_output(state_dir, run_id="abc123", stdout=b"hello", stderr=b"warn")
        assert result is not None
        assert result.exists()
        content = result.read_bytes()
        assert b"hello" in content
        assert b"warn" in content

    async def test_creates_directory(self, tmp_path: Path) -> None:
        state_dir = tmp_path / "new" / "state"
        result = await save_run_output(state_dir, run_id="xyz", stdout=b"output", stderr=b"")
        assert result is not None
        assert result.parent.exists()

    async def test_returns_none_for_empty_output(self, tmp_path: Path) -> None:
        state_dir = tmp_path / "state"
        result = await save_run_output(state_dir, run_id="empty", stdout=b"", stderr=b"")
        assert result is None
