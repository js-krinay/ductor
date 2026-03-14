"""Tests for TaskRegistry (SQLite-backed)."""

from __future__ import annotations

import asyncio
import shutil
from collections.abc import AsyncIterator
from pathlib import Path

import pytest

from klir.infra.db import KlirDB
from klir.tasks.models import TaskSubmit
from klir.tasks.registry import TaskRegistry


@pytest.fixture
async def db(tmp_path: Path) -> AsyncIterator[KlirDB]:
    instance = KlirDB(tmp_path / "klir.db")
    await instance.open()
    try:
        yield instance
    finally:
        await instance.close()


@pytest.fixture
async def registry(db: KlirDB, tmp_path: Path) -> TaskRegistry:
    reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
    await reg.load()
    return reg


def _submit(prompt: str = "test prompt", name: str = "") -> TaskSubmit:
    return TaskSubmit(
        chat_id=42,
        prompt=prompt,
        message_id=1,
        thread_id=None,
        parent_agent="main",
        name=name,
    )


class TestCreate:
    async def test_creates_entry_and_folder(self, registry: TaskRegistry, tmp_path: Path) -> None:
        entry = await registry.create(_submit("build website", name="Website"), "claude", "opus")
        assert entry.status == "running"
        assert entry.name == "Website"
        assert entry.provider == "claude"
        assert entry.prompt_preview == "build website"

        # Task folder and TASKMEMORY.md created
        folder = registry.task_folder(entry.task_id)
        assert folder.is_dir()
        assert registry.taskmemory_path(entry.task_id).is_file()

    async def test_auto_name_from_id(self, registry: TaskRegistry) -> None:
        entry = await registry.create(_submit(), "claude", "opus")
        assert entry.name == entry.task_id  # Fallback to task_id

    async def test_persists_to_sqlite(self, db: KlirDB, tmp_path: Path) -> None:
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()
        await reg.create(_submit(name="A"), "claude", "opus")
        await reg.create(_submit(name="B"), "codex", "gpt-4.1")

        # Reload from same db
        reg2 = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg2.load()
        assert len(reg2.list_all()) == 2


class TestGet:
    async def test_get_existing(self, registry: TaskRegistry) -> None:
        entry = await registry.create(_submit(), "claude", "opus")
        assert registry.get(entry.task_id) is not None

    async def test_get_missing(self, registry: TaskRegistry) -> None:
        assert registry.get("nonexistent") is None


class TestFindByName:
    async def test_finds_by_name(self, registry: TaskRegistry) -> None:
        await registry.create(_submit(name="Hotel Paris"), "claude", "opus")
        found = registry.find_by_name(42, "hotel paris")
        assert found is not None
        assert found.name == "Hotel Paris"

    async def test_not_found_wrong_chat(self, registry: TaskRegistry) -> None:
        await registry.create(_submit(name="Test"), "claude", "opus")
        assert registry.find_by_name(999, "Test") is None


class TestUpdateStatus:
    async def test_updates_status_and_fields(self, registry: TaskRegistry) -> None:
        entry = await registry.create(_submit(), "claude", "opus")
        await registry.update_status(entry.task_id, "done", elapsed_seconds=5.0, error="")
        updated = registry.get(entry.task_id)
        assert updated is not None
        assert updated.status == "done"
        assert updated.elapsed_seconds == 5.0

    async def test_ignores_unknown_task(self, registry: TaskRegistry) -> None:
        await registry.update_status("bogus", "done")  # Should not raise


class TestListActive:
    async def test_filters_running(self, registry: TaskRegistry) -> None:
        e1 = await registry.create(_submit(name="A"), "claude", "opus")
        await registry.create(_submit(name="B"), "claude", "opus")
        await registry.update_status(e1.task_id, "done")

        active = registry.list_active(chat_id=42)
        assert len(active) == 1
        assert active[0].name == "B"


class TestCleanupOld:
    async def test_removes_old_completed(self, registry: TaskRegistry, db: KlirDB) -> None:
        entry = await registry.create(_submit(), "claude", "opus")
        await registry.update_status(entry.task_id, "done")
        # Set old timestamp via db
        await db.execute(
            "UPDATE tasks SET created_at = ? WHERE task_id = ?",
            (0.0, entry.task_id),
        )
        # Update in-memory too
        entry.created_at = 0.0

        removed = await registry.cleanup_old(max_age_hours=1)
        assert removed == 1
        assert registry.get(entry.task_id) is None

    async def test_keeps_recent(self, registry: TaskRegistry) -> None:
        entry = await registry.create(_submit(), "claude", "opus")
        await registry.update_status(entry.task_id, "done")

        removed = await registry.cleanup_old(max_age_hours=1)
        assert removed == 0


class TestCleanupFinished:
    async def test_removes_all_finished(self, registry: TaskRegistry) -> None:
        e1 = await registry.create(_submit(name="A"), "claude", "opus")
        e2 = await registry.create(_submit(name="B"), "claude", "opus")
        e3 = await registry.create(_submit(name="C"), "claude", "opus")
        await registry.update_status(e1.task_id, "done")
        await registry.update_status(e2.task_id, "failed", error="oops")
        # e3 stays running

        removed = await registry.cleanup_finished(chat_id=42)
        assert removed == 2
        assert registry.get(e1.task_id) is None
        assert registry.get(e2.task_id) is None
        assert registry.get(e3.task_id) is not None

    async def test_scoped_to_chat(self, registry: TaskRegistry) -> None:
        e1 = await registry.create(_submit(name="A"), "claude", "opus")
        await registry.update_status(e1.task_id, "done")

        # Different chat_id -> nothing removed
        removed = await registry.cleanup_finished(chat_id=999)
        assert removed == 0
        assert registry.get(e1.task_id) is not None

    async def test_removes_task_folder(self, registry: TaskRegistry) -> None:
        entry = await registry.create(_submit(name="X"), "claude", "opus")
        folder = registry.task_folder(entry.task_id)
        assert folder.is_dir()

        await registry.update_status(entry.task_id, "cancelled")
        await registry.cleanup_finished(chat_id=42)
        assert not folder.exists()

    async def test_noop_when_empty(self, registry: TaskRegistry) -> None:
        assert await registry.cleanup_finished() == 0


class TestDelete:
    async def test_deletes_finished_task(self, registry: TaskRegistry, tmp_path: Path) -> None:
        entry = await registry.create(_submit(name="Deletable"), "claude", "opus")
        folder = registry.task_folder(entry.task_id)
        assert folder.is_dir()

        await registry.update_status(entry.task_id, "done")
        assert await registry.delete(entry.task_id) is True
        assert registry.get(entry.task_id) is None
        assert not folder.exists()

    async def test_rejects_running_task(self, registry: TaskRegistry) -> None:
        entry = await registry.create(_submit(name="Active"), "claude", "opus")
        assert await registry.delete(entry.task_id) is False
        assert registry.get(entry.task_id) is not None

    async def test_rejects_waiting_task(self, registry: TaskRegistry) -> None:
        entry = await registry.create(_submit(name="Waiting"), "claude", "opus")
        await registry.update_status(entry.task_id, "waiting")
        assert await registry.delete(entry.task_id) is False

    async def test_returns_false_for_missing(self, registry: TaskRegistry) -> None:
        assert await registry.delete("nonexistent") is False

    async def test_deletes_all_finished_statuses(self, registry: TaskRegistry) -> None:
        for status in ("done", "failed", "cancelled"):
            entry = await registry.create(_submit(name=status), "claude", "opus")
            await registry.update_status(entry.task_id, status)
            assert await registry.delete(entry.task_id) is True

    async def test_deletes_subagent_task_folder(
        self, registry: TaskRegistry, tmp_path: Path
    ) -> None:
        agent_dir = tmp_path / "agents" / "sub1" / "workspace" / "tasks"
        entry = await registry.create(
            _submit(name="SubTask"), "codex", "gpt-5.2", tasks_dir=agent_dir
        )
        folder = registry.task_folder(entry.task_id)
        assert str(agent_dir) in str(folder)
        assert folder.is_dir()

        await registry.update_status(entry.task_id, "done")
        assert await registry.delete(entry.task_id) is True
        assert not folder.exists()


class TestLoadRecovery:
    async def test_downgrades_stale_running(self, db: KlirDB, tmp_path: Path) -> None:
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()
        entry = await reg.create(_submit(), "claude", "opus")
        assert entry.status == "running"

        # Simulate restart
        reg2 = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg2.load()
        loaded = reg2.get(entry.task_id)
        assert loaded is not None
        assert loaded.status == "failed"
        assert "restarted" in loaded.error.lower()


class TestCleanupOrphans:
    async def test_entry_without_folder_removed(self, db: KlirDB, tmp_path: Path) -> None:
        """Registry entry whose task folder was deleted -> entry dropped."""
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()
        entry = await reg.create(_submit(name="Ghost"), "claude", "opus")

        # Delete the folder behind the registry's back
        shutil.rmtree(reg.task_folder(entry.task_id))

        # Orphan cleanup should drop the entry
        removed = await reg.cleanup_orphans()
        assert removed >= 1
        assert reg.get(entry.task_id) is None

    async def test_folder_without_entry_removed(self, db: KlirDB, tmp_path: Path) -> None:
        """Task folder with no matching registry entry -> folder deleted."""
        tasks_dir = tmp_path / "tasks"
        tasks_dir.mkdir(parents=True)
        orphan = tasks_dir / "deadbeef"
        orphan.mkdir()
        (orphan / "TASKMEMORY.md").write_text("leftover")

        reg = TaskRegistry(db=db, tasks_dir=tasks_dir)
        await reg.load()  # cleanup_orphans runs during load
        assert not orphan.exists()

    async def test_valid_entries_untouched(self, db: KlirDB, tmp_path: Path) -> None:
        """Entries with matching folders survive orphan cleanup."""
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()
        entry = await reg.create(_submit(name="Valid"), "claude", "opus")

        removed = await reg.cleanup_orphans()
        assert removed == 0
        assert reg.get(entry.task_id) is not None
        assert reg.task_folder(entry.task_id).is_dir()


class TestPerAgentTasksDir:
    """Task folder isolation for sub-agents."""

    async def test_create_with_custom_tasks_dir(
        self, registry: TaskRegistry, tmp_path: Path
    ) -> None:
        agent_dir = tmp_path / "agents" / "test" / "workspace" / "tasks"
        entry = await registry.create(
            _submit(name="Agent Task"), "codex", "gpt-5.2", tasks_dir=agent_dir
        )

        # Folder created in agent's workspace, not default
        folder = registry.task_folder(entry.task_id)
        assert str(agent_dir) in str(folder)
        assert folder.is_dir()
        assert (folder / "TASKMEMORY.md").is_file()

        # Default tasks dir NOT used
        default_folder = tmp_path / "tasks" / entry.task_id
        assert not default_folder.exists()

    async def test_tasks_dir_persisted_and_reloaded(self, db: KlirDB, tmp_path: Path) -> None:
        agent_dir = tmp_path / "agents" / "sub1" / "workspace" / "tasks"
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()
        entry = await reg.create(_submit(name="Persistent"), "claude", "opus", tasks_dir=agent_dir)

        # Reload registry — stored tasks_dir should be used
        reg2 = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg2.load()
        loaded = reg2.get(entry.task_id)
        assert loaded is not None
        assert loaded.tasks_dir == str(agent_dir)

        folder = reg2.task_folder(entry.task_id)
        assert str(agent_dir) in str(folder)
        assert folder.is_dir()

    async def test_default_tasks_dir_when_none(
        self, registry: TaskRegistry, tmp_path: Path
    ) -> None:
        """Without override, task folder uses default tasks_dir."""
        entry = await registry.create(_submit(name="Default"), "claude", "opus")
        folder = registry.task_folder(entry.task_id)
        assert str(tmp_path / "tasks") in str(folder)

    async def test_cleanup_orphans_scans_agent_dirs(self, db: KlirDB, tmp_path: Path) -> None:
        """Orphan cleanup scans per-agent task dirs too."""
        agent_dir = tmp_path / "agents" / "sub1" / "workspace" / "tasks"
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()
        entry = await reg.create(_submit(name="Agent"), "claude", "opus", tasks_dir=agent_dir)

        # Create an orphan folder in the agent's tasks dir
        orphan = agent_dir / "deadbeef"
        orphan.mkdir(parents=True)
        (orphan / "TASKMEMORY.md").write_text("leftover")

        removed = await reg.cleanup_orphans()
        assert removed == 1
        assert not orphan.exists()
        # Real entry folder untouched
        assert reg.task_folder(entry.task_id).is_dir()

    async def test_cleanup_removes_agent_entry_without_folder(
        self, db: KlirDB, tmp_path: Path
    ) -> None:
        """Entry with agent tasks_dir whose folder is missing -> dropped."""
        agent_dir = tmp_path / "agents" / "sub1" / "workspace" / "tasks"
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()
        entry = await reg.create(_submit(name="Ghost"), "claude", "opus", tasks_dir=agent_dir)

        # Delete folder behind registry's back
        shutil.rmtree(reg.task_folder(entry.task_id))

        removed = await reg.cleanup_orphans()
        assert removed >= 1
        assert reg.get(entry.task_id) is None


class TestConcurrency:
    async def test_concurrent_creates(self, db: KlirDB, tmp_path: Path) -> None:
        """Concurrent task creates don't lose updates."""
        reg = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg.load()

        # Create 10 tasks concurrently
        coros = [reg.create(_submit(name=f"T{i}"), "claude", "opus") for i in range(10)]
        entries = await asyncio.gather(*coros)

        assert len(entries) == 10
        assert len(reg.list_all()) == 10

        # Verify all persisted
        reg2 = TaskRegistry(db=db, tasks_dir=tmp_path / "tasks")
        await reg2.load()
        assert len(reg2.list_all()) == 10
