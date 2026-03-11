"""Per-run logging for cron jobs: JSONL log files and output capture."""

from __future__ import annotations

import asyncio
import json
import time as _time
from dataclasses import asdict, dataclass, fields
from pathlib import Path

DEFAULT_MAX_BYTES = 2_000_000
DEFAULT_KEEP_LINES = 2_000


@dataclass(slots=True)
class CronRunLogEntry:
    """A single log entry recording the outcome of one cron job execution."""

    ts: float
    job_id: str
    action: str = "finished"
    status: str | None = None
    error: str | None = None
    summary: str | None = None
    duration_ms: int | None = None
    delivery_status: str | None = None
    delivery_error: str | None = None
    provider: str | None = None
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    run_id: str | None = None
    output_path: str | None = None

    def to_json_line(self) -> str:
        """Serialize to compact JSON (no trailing newline), omitting None fields."""
        data = {k: v for k, v in asdict(self).items() if v is not None}
        return json.dumps(data, separators=(",", ":"))

    @classmethod
    def from_json_line(cls, line: str) -> CronRunLogEntry | None:
        """Parse a JSON line. Returns None for malformed or missing-field entries."""
        try:
            data = json.loads(line.strip())
        except (json.JSONDecodeError, TypeError):
            return None
        if not isinstance(data, dict):
            return None
        ts = data.get("ts")
        job_id = data.get("job_id")
        if not isinstance(ts, (int, float)) or not isinstance(job_id, str) or not job_id.strip():
            return None
        valid_keys = {f.name for f in fields(cls)}
        try:
            return cls(**{k: v for k, v in data.items() if k in valid_keys})
        except Exception:
            return None


def resolve_run_log_path(cron_state_dir: Path, job_id: str) -> Path:
    """Return JSONL log path for a job. Raises ValueError on path traversal attempt."""
    state_resolved = cron_state_dir.resolve()
    job_path = (cron_state_dir / job_id).resolve()
    if not str(job_path).startswith(str(state_resolved) + "/") and job_path != state_resolved:
        raise ValueError(f"Invalid job_id (path traversal detected): {job_id!r}")
    return job_path / "runs.jsonl"


async def append_run_log(
    path: Path,
    entry: CronRunLogEntry,
    *,
    max_bytes: int = DEFAULT_MAX_BYTES,
    keep_lines: int = DEFAULT_KEEP_LINES,
) -> None:
    """Append entry to JSONL log. Prunes file if it exceeds max_bytes."""
    await asyncio.to_thread(_do_append_and_prune, path, entry, max_bytes, keep_lines)


def _do_append_and_prune(
    path: Path,
    entry: CronRunLogEntry,
    max_bytes: int,
    keep_lines: int,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(entry.to_json_line() + "\n")
    if path.stat().st_size > max_bytes:
        _prune_if_needed(path, keep_lines)


def _prune_if_needed(path: Path, keep_lines: int) -> None:
    """Trim log file keeping only the most recent keep_lines lines."""
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) > keep_lines:
        kept = lines[-keep_lines:]
        path.write_text("\n".join(kept) + "\n", encoding="utf-8")


@dataclass(frozen=True, slots=True)
class RunLogPage:
    """A paginated view of run log entries."""

    entries: list[CronRunLogEntry]
    total: int
    offset: int
    limit: int
    has_more: bool


async def read_run_log_page(
    path: Path,
    *,
    limit: int = 50,
    offset: int = 0,
    status_filter: str = "all",
    sort_dir: str = "desc",
) -> RunLogPage:
    """Read paginated run log entries with optional status filtering."""
    entries = await asyncio.to_thread(_parse_all_entries, path)
    if status_filter != "all":
        entries = [e for e in entries if e.status == status_filter]
    if sort_dir == "desc":
        entries = list(reversed(entries))
    total = len(entries)
    page_entries = entries[offset : offset + limit]
    return RunLogPage(
        entries=page_entries,
        total=total,
        offset=offset,
        limit=limit,
        has_more=(offset + limit) < total,
    )


def _parse_all_entries(path: Path) -> list[CronRunLogEntry]:
    """Parse all valid entries from a JSONL file, skipping malformed lines."""
    if not path.exists():
        return []
    entries = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        stripped = raw_line.strip()
        if stripped:
            entry = CronRunLogEntry.from_json_line(stripped)
            if entry is not None:
                entries.append(entry)
    return entries


async def save_run_output(
    state_dir: Path,
    *,
    run_id: str,
    stdout: bytes,
    stderr: bytes,
) -> Path | None:
    """Save full stdout/stderr to a per-run output file. Returns path or None if empty."""
    if not stdout and not stderr:
        return None
    return await asyncio.to_thread(_write_output, state_dir, run_id, stdout, stderr)


def _write_output(state_dir: Path, run_id: str, stdout: bytes, stderr: bytes) -> Path:
    """Write output to {state_dir}/runs/{run_id}.log."""
    runs_dir = state_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)
    output_path = runs_dir / f"{run_id}.log"
    with output_path.open("wb") as f:
        if stdout:
            f.write(b"=== STDOUT ===\n")
            f.write(stdout)
        if stderr:
            f.write(b"=== STDERR ===\n")
            f.write(stderr)
    return output_path


def prune_run_outputs(state_dir: Path, *, max_age_seconds: float = 30 * 86400) -> int:
    """Delete run output files older than max_age_seconds.

    Call periodically (e.g. from the daily cleanup observer) to prevent
    orphaned .log files accumulating after their JSONL entries are pruned.
    Returns the number of files deleted.
    """
    runs_dir = state_dir / "runs"
    if not runs_dir.exists():
        return 0
    cutoff = _time.time() - max_age_seconds
    deleted = 0
    for log_file in runs_dir.glob("*.log"):
        try:
            if log_file.stat().st_mtime < cutoff:
                log_file.unlink()
                deleted += 1
        except OSError:
            pass
    return deleted
