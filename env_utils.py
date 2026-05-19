"""
env_utils.py
────────────
Utilities for reading .env at project root.

ANTHROPIC_API_KEY is managed manually by the user in .env — there is no write path.
Never log or return the key value; use get_env_key() only at call time.
"""

import os
from pathlib import Path

from dotenv import load_dotenv as _dotenv_load

ENV_PATH = Path(__file__).parent / ".env"


def load_dotenv() -> None:
    """Load .env into os.environ. Skips keys already set in the environment."""
    _dotenv_load(dotenv_path=ENV_PATH, override=False)


def get_env_key(key: str) -> str | None:
    """Return a key's value from os.environ, or None if not set."""
    return os.environ.get(key)
