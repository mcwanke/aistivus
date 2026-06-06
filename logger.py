"""
logger.py
─────────
Structured JSON logging for AIstivus.

Phase 1.0+: stdlib logging with RotatingFileHandler (file) + StreamHandler (stdout).
All records emitted as newline-delimited JSON.
Config loaded from config.yaml logging section; sensible defaults if absent.

NEVER pass API keys, prompt content, LLM responses, resume text, or PII
to any logger call. Enforcement is at the call site, not here.

Usage:
    from logger import get_logger
    log = get_logger(__name__)
    log.info("server started", extra={"port": 8080})
    log.warning("no models available")
    log.error("db init failed", exc_info=True)
"""

import json
import logging
import logging.handlers
import os
from datetime import datetime, timezone
from pathlib import Path

import yaml

# ─────────────────────────────────────────────────────────────
# JSON formatter
# ─────────────────────────────────────────────────────────────

_STDLIB_ATTRS = frozenset({
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName",
})


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        if record.stack_info:
            entry["stack"] = self.formatStack(record.stack_info)
        # Merge any caller-supplied extra={...} fields
        for k, v in record.__dict__.items():
            if k not in _STDLIB_ATTRS and not k.startswith("_"):
                entry[k] = v
        return json.dumps(entry, default=str)


# ─────────────────────────────────────────────────────────────
# Configuration loading
# ─────────────────────────────────────────────────────────────

def _load_logging_config() -> dict:
    """Return the [logging] section of config.yaml, or {} if unavailable."""
    try:
        config_path = Path("user_data/config.yaml")
        if config_path.exists():
            with open(config_path) as f:
                cfg = yaml.safe_load(f) or {}
                return cfg.get("logging", {})
    except Exception:
        pass
    return {}


# ─────────────────────────────────────────────────────────────
# Root logger configuration (runs once)
# ─────────────────────────────────────────────────────────────

_configured = False


def _configure_root_logger() -> None:
    """
    Configure the root logger with a RotatingFileHandler + StreamHandler.
    Idempotent — safe to call multiple times; only applies on first call.
    """
    global _configured
    if _configured:
        return
    _configured = True

    cfg = _load_logging_config()
    level_name = cfg.get("level", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    log_file = Path(cfg.get("file", "./app_data/logs/app.log"))
    max_bytes = int(cfg.get("max_bytes", 10_485_760))   # 10 MB
    backup_count = int(cfg.get("backup_count", 5))

    formatter = _JsonFormatter()
    root = logging.getLogger()
    root.setLevel(level)

    # Guard: don't add duplicate handlers if something else already configured root
    if root.handlers:
        return

    # File handler — create logs/ dir if needed; skip on permission error
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=max_bytes,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)
    except (OSError, PermissionError):
        pass  # Continue with stdout only

    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    root.addHandler(stream_handler)


# ─────────────────────────────────────────────────────────────
# Log file cleanup
# ─────────────────────────────────────────────────────────────

def cleanup_old_logs(retention_days: int | None = None) -> int:
    """
    Delete rotated log files older than retention_days.
    Returns count of files deleted. Does nothing if retention_days is 0 or None.
    """
    if not retention_days:
        cfg = _load_logging_config()
        retention_days = int(cfg.get("retention_days", 30))
    if not retention_days:
        return 0

    cfg = _load_logging_config()
    log_file = Path(cfg.get("file", "./app_data/logs/app.log"))
    log_dir = log_file.parent
    if not log_dir.exists():
        return 0

    import time
    cutoff = time.time() - (retention_days * 86400)
    deleted = 0
    stem = log_file.stem
    suffix = log_file.suffix

    for f in log_dir.iterdir():
        if not f.is_file():
            continue
        # Match rotated files: app.log.1, app.log.2, etc.
        if f.name.startswith(stem) and f.name != log_file.name:
            if f.stat().st_mtime < cutoff:
                try:
                    f.unlink()
                    deleted += 1
                except OSError:
                    pass

    return deleted


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────

def get_logger(name: str) -> logging.Logger:
    """
    Return a named logger, configuring the root logger on first call.
    Call once per module: log = get_logger(__name__)
    """
    _configure_root_logger()
    return logging.getLogger(name)
