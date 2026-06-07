"""
limiter.py
──────────
Shared rate limiter instance. Imported by main.py and any sub-router
that needs @limiter.limit() decorators (e.g. document_routes.py).
Both files must use this same instance so the middleware and decorators
share the same storage backend.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
