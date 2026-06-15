"""Base scraper with rate limiting, retry, and polite scraping patterns."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from urllib.robotparser import RobotFileParser

import httpx
import structlog

from app.config import settings
from app.scraping.cache import TTLCache

logger = structlog.get_logger()


class RateLimiter:
    """Async rate limiter enforcing minimum intervals between requests."""

    def __init__(self, requests_per_second: float = 1.0) -> None:
        self.min_interval = timedelta(seconds=1.0 / requests_per_second)
        self.last_request = datetime.min.replace(tzinfo=timezone.utc)
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        """Wait until the rate limit allows the next request."""
        async with self._lock:
            now = datetime.now(timezone.utc)
            elapsed = now - self.last_request
            if elapsed < self.min_interval:
                wait_seconds = (self.min_interval - elapsed).total_seconds()
                logger.debug("Rate limiter waiting", wait_seconds=round(wait_seconds, 2))
                await asyncio.sleep(wait_seconds)
            self.last_request = datetime.now(timezone.utc)


class BaseScraper:
    """Base scraper with rate limiting, retry, caching, and robots.txt compliance."""

    USER_AGENT = (
        "TheTell-Bot/1.0 (+https://thetell.example.com/bot; contact@example.com)"
    )

    def __init__(
        self,
        rate_limit: float | None = None,
        timeout: int | None = None,
        max_retries: int = 3,
        cache_ttl: int = 300,
    ) -> None:
        self._rate_limiter = RateLimiter(rate_limit or settings.scrape_rate_limit)
        self._timeout = timeout or settings.scrape_timeout
        self._max_retries = max_retries
        self._cache = TTLCache(default_ttl=cache_ttl)
        self._robots_cache: dict[str, RobotFileParser] = {}
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self._timeout),
                headers={"User-Agent": self.USER_AGENT},
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def _can_scrape(self, url: str) -> bool:
        """Check robots.txt to determine if scraping is allowed."""
        parsed = httpx.URL(url)
        base_url = f"{parsed.scheme}://{parsed.host}"
        robots_url = f"{base_url}/robots.txt"

        if base_url not in self._robots_cache:
            rp = RobotFileParser()
            rp.set_url(robots_url)
            try:
                client = await self._get_client()
                response = await client.get(robots_url)
                if response.status_code == 200:
                    rp.parse(response.text.splitlines())
                else:
                    # If robots.txt is unavailable, assume allowed
                    return True
            except Exception:
                logger.warning("Failed to fetch robots.txt", url=robots_url)
                return True
            self._robots_cache[base_url] = rp

        return self._robots_cache[base_url].can_fetch("*", url)

    async def fetch(self, url: str) -> str | None:
        """Fetch a URL with rate limiting, caching, retry, and robots.txt compliance.

        Returns the response text, or None if the request failed after retries.
        """
        cached = self._cache.get(url)
        if cached is not None:
            logger.debug("Cache hit", url=url)
            return cached

        if not await self._can_scrape(url):
            logger.info("Blocked by robots.txt", url=url)
            return None

        last_exception: Exception | None = None

        for attempt in range(1, self._max_retries + 1):
            await self._rate_limiter.wait()
            try:
                client = await self._get_client()
                response = await client.get(url)

                if response.status_code == 200:
                    self._cache.set(url, response.text)
                    logger.info("Successfully fetched", url=url, attempt=attempt)
                    return response.text

                if response.status_code in (429, 503):
                    retry_after = response.headers.get("Retry-After")
                    wait_time = (
                        int(retry_after)
                        if retry_after
                        else min(2**attempt, 60)
                    )
                    logger.warning(
                        "Rate limited / unavailable",
                        url=url,
                        status=response.status_code,
                        wait_time=wait_time,
                        attempt=attempt,
                    )
                    await asyncio.sleep(wait_time)
                    continue

                response.raise_for_status()

            except httpx.HTTPStatusError as e:
                last_exception = e
                logger.warning(
                    "HTTP error",
                    url=url,
                    status=e.response.status_code,
                    attempt=attempt,
                )
            except httpx.RequestError as e:
                last_exception = e
                wait_time = min(2**attempt, 60)
                logger.warning(
                    "Request error",
                    url=url,
                    error=str(e),
                    attempt=attempt,
                    wait_time=wait_time,
                )
                await asyncio.sleep(wait_time)

        logger.error(
            "Failed to fetch after retries",
            url=url,
            max_retries=self._max_retries,
            error=str(last_exception),
        )
        return None
