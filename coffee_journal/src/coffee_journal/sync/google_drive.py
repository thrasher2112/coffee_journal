"""Future Google Drive sync integration placeholder."""
from __future__ import annotations


class GoogleDriveSyncStub:
    """Mock queue for planning future Google Drive sync."""

    def __init__(self) -> None:
        self._pending_jobs = 0

    def enqueue_sync(self) -> None:
        """Pretend to enqueue a job (TODO: wire to OAuth + Drive API)."""
        self._pending_jobs += 1

    @property
    def pending_jobs(self) -> int:
        return self._pending_jobs
