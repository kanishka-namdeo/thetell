"""In-memory cache with TTL for scraping."""

from __future__ import annotations

import time
from typing import Any


class TTLCache:
    """Simple in-memory cache with time-to-live expiration."""

    def __init__(self, default_ttl: int = 300) -> None:
        self._store: dict[str, tuple[Any, float]] = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Any | None:
        """Get a cached value if it exists and hasn't expired."""
        if key not in self._store:
            return None
        value, expires_at = self._store[key]
        if time.monotonic() > expires_at:
            del self._store[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Store a value with an optional custom TTL."""
        effective_ttl = ttl if ttl is not None else self._default_ttl
        expires_at = time.monotonic() + effective_ttl
        self._store[key] = (value, expires_at)

    def delete(self, key: str) -> None:
        """Remove a key from the cache."""
        self._store.pop(key, None)

    def clear(self) -> None:
        """Remove all entries from the cache."""
        self._store.clear()

    def cleanup(self) -> int:
        """Remove expired entries and return count of removed items."""
        now = time.monotonic()
        expired = [k for k, (_, exp) in self._store.items() if now > exp]
        for k in expired:
            del self._store[k]
        return len(expired)

    @property
    def size(self) -> int:
        """Number of entries currently in the cache (including expired)."""
        return len(self._store)
