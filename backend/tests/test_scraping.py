"""Tests for the scraping module."""

from __future__ import annotations

import pytest

from app.scraping.cache import TTLCache


def test_cache_set_and_get():
    """Test basic cache set and get."""
    cache = TTLCache(default_ttl=300)
    cache.set("key1", "value1")
    assert cache.get("key1") == "value1"


def test_cache_miss():
    """Test cache miss returns None."""
    cache = TTLCache(default_ttl=300)
    assert cache.get("nonexistent") is None


def test_cache_delete():
    """Test cache delete."""
    cache = TTLCache(default_ttl=300)
    cache.set("key1", "value1")
    cache.delete("key1")
    assert cache.get("key1") is None


def test_cache_clear():
    """Test cache clear."""
    cache = TTLCache(default_ttl=300)
    cache.set("key1", "value1")
    cache.set("key2", "value2")
    cache.clear()
    assert cache.size == 0


def test_cache_size():
    """Test cache size property."""
    cache = TTLCache(default_ttl=300)
    assert cache.size == 0
    cache.set("key1", "value1")
    assert cache.size == 1
    cache.set("key2", "value2")
    assert cache.size == 2
