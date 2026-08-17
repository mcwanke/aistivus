"""
worker_executor.py
──────────────────
Background thread executor for the worker queue. Polls backend_workers table
for pending tasks and executes them serially (or in parallel if configured).

Started on app startup in main.py.
"""

import asyncio
import threading
import time
from datetime import datetime, timezone

import database
import logger as log_module
import workers

# ─────────────────────────────────────────────────────────────
# Executor
# ─────────────────────────────────────────────────────────────


class WorkerExecutor:
    """Polls and executes workers from the queue."""

    def __init__(self, poll_interval: float = 5.0, parallel_workers: int = 1):
        """
        Args:
            poll_interval: Seconds between polling for pending workers
            parallel_workers: Number of concurrent workers (currently always 1)
        """
        self.poll_interval = poll_interval
        self.parallel_workers = parallel_workers
        self.running = False
        self.thread: threading.Thread | None = None
        self.logger = log_module.get_logger("worker_executor")

    def start(self) -> None:
        """Start the executor thread."""
        if self.running:
            return

        self.running = True
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()
        self.logger.info(
            f"[WorkerExecutor] Started with poll_interval={self.poll_interval}s, "
            f"parallel_workers={self.parallel_workers}"
        )

    def stop(self) -> None:
        """Stop the executor thread."""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        self.logger.info("[WorkerExecutor] Stopped")

    def _run(self) -> None:
        """Main loop: poll for workers and execute them."""
        while self.running:
            try:
                # Fetch up to parallel_workers pending workers
                pending = database.get_pending_workers(limit=self.parallel_workers)

                if pending:
                    self.logger.debug(f"[WorkerExecutor] Found {len(pending)} pending workers")
                    for worker_row in pending:
                        self._execute_worker(worker_row)
                else:
                    # No work; sleep before polling again
                    time.sleep(self.poll_interval)

            except Exception as e:
                self.logger.error(f"[WorkerExecutor] Error in main loop: {e}", exc_info=True)
                time.sleep(self.poll_interval)

    def _execute_worker(self, worker_row: dict) -> None:
        """Execute a single worker task."""
        worker_id = worker_row["id"]
        worker_type = worker_row["worker_type"]
        entity_type = worker_row["entity_type"]
        entity_id = worker_row["entity_id"]

        self.logger.info(
            f"[WorkerExecutor] Starting worker {worker_id} ({worker_type}) "
            f"for {entity_type}:{entity_id}"
        )

        # Update status to running
        now = datetime.now(timezone.utc).isoformat()
        database.update_worker_status(worker_id, "running", started_at=now)

        try:
            # Get handler from registry
            if worker_type not in workers.WORKERS:
                raise ValueError(f"Unknown worker type: {worker_type}")

            handler = workers.WORKERS[worker_type]["handler"]

            # Parse input
            input_data = {}
            if worker_row["input_json"]:
                import json
                input_data = json.loads(worker_row["input_json"])

            # Execute handler (async)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                output = loop.run_until_complete(handler(input_data))
            finally:
                loop.close()

            # Update output
            database.update_worker_output(worker_id, output, status="completed")
            self.logger.info(f"[WorkerExecutor] Completed worker {worker_id} ({worker_type})")

        except Exception as e:
            error_msg = f"{type(e).__name__}: {e!s}"
            database.update_worker_error(worker_id, error_msg)
            self.logger.error(
                f"[WorkerExecutor] Failed worker {worker_id} ({worker_type}): {error_msg}",
                exc_info=True,
            )


# Global executor instance
_executor: WorkerExecutor | None = None


def get_executor() -> WorkerExecutor:
    """Get or create the global executor."""
    global _executor
    if _executor is None:
        # Load parallel_workers from config
        from pathlib import Path

        import yaml

        config_path = Path("user_data/config.yaml")
        config = {}
        if config_path.exists():
            with open(config_path) as f:
                config = yaml.safe_load(f) or {}

        parallel_workers = config.get("worker_system", {}).get("parallel_workers", 1)
        _executor = WorkerExecutor(poll_interval=5.0, parallel_workers=parallel_workers)
    return _executor


def start_executor() -> None:
    """Start the global executor."""
    executor = get_executor()
    executor.start()


def stop_executor() -> None:
    """Stop the global executor."""
    global _executor
    if _executor:
        _executor.stop()
        _executor = None
