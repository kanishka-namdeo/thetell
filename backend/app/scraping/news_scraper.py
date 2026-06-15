"""News article scraper with HTML parsing and metadata extraction."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from urllib.parse import urlparse, urlunparse

from bs4 import BeautifulSoup
from bs4.element import Tag
import structlog
from pydantic import BaseModel, Field

from app.scraping.base import BaseScraper

logger = structlog.get_logger()


class ArticleData(BaseModel):
    """Parsed article data from a news page."""

    url: str
    title: str = ""
    author: str = ""
    published_at: datetime | None = None
    body_text: str = ""
    description: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class NewsScraper(BaseScraper):
    """Scraper specialized for news articles."""

    async def scrape_article(self, url: str) -> ArticleData | None:
        """Scrape and parse a news article from a URL.

        Returns ArticleData or None if scraping failed.
        """
        normalized_url = self._normalize_url(url)
        html = await self.fetch(normalized_url)
        if html is None:
            return None

        try:
            soup = BeautifulSoup(html, "html.parser")
            article = ArticleData(
                url=normalized_url,
                title=self._extract_title(soup),
                author=self._extract_author(soup),
                published_at=self._extract_date(soup),
                body_text=self._extract_body(soup),
                description=self._extract_description(soup),
                metadata=self._extract_metadata(soup),
            )
            logger.info(
                "Scraped article",
                url=normalized_url,
                title=article.title[:60],
                body_length=len(article.body_text),
            )
            return article
        except Exception:
            logger.exception("Failed to parse article", url=normalized_url)
            return None

    def _normalize_url(self, url: str) -> str:
        """Normalize URL for deduplication."""
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        normalized = parsed._replace(path=path, fragment="", query="")
        return urlunparse(normalized)

    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract article title using multiple strategies."""
        # OpenGraph title
        og_title = soup.find("meta", property="article:published_time")
        if og_title:
            og = soup.find("meta", property="og:title")
            if og and og.get("content"):
                return og["content"].strip()

        # Schema.org headline
        headline = soup.find(attrs={"itemprop": "headline"})
        if headline and headline.get_text(strip=True):
            return headline.get_text(strip=True)

        # <h1> tag
        h1 = soup.find("h1")
        if h1 and h1.get_text(strip=True):
            return h1.get_text(strip=True)

        # <title> tag
        title = soup.find("title")
        if title and title.get_text(strip=True):
            return title.get_text(strip=True)

        return ""

    def _extract_author(self, soup: BeautifulSoup) -> str:
        """Extract article author using multiple strategies."""
        # OpenGraph
        og_author = soup.find("meta", property="article:author")
        if og_author and og_author.get("content"):
            return og_author["content"].strip()

        # Schema.org author
        author_tag = soup.find(attrs={"itemprop": "author"})
        if author_tag:
            if isinstance(author_tag, Tag):
                name = author_tag.find(attrs={"itemprop": "name"})
                if name:
                    return name.get_text(strip=True)
                return author_tag.get_text(strip=True)

        # Meta author
        meta_author = soup.find("meta", attrs={"name": "author"})
        if meta_author and meta_author.get("content"):
            return meta_author["content"].strip()

        return ""

    def _extract_date(self, soup: BeautifulSoup) -> datetime | None:
        """Extract publication date using multiple strategies."""
        date_str = None

        # OpenGraph
        og_date = soup.find("meta", property="article:published_time")
        if og_date and og_date.get("content"):
            date_str = og_date["content"]

        # Schema.org datePublished
        if not date_str:
            schema_date = soup.find(attrs={"itemprop": "datePublished"})
            if schema_date:
                date_str = schema_date.get("content") or schema_date.get("datetime")

        # <time> tag
        if not date_str:
            time_tag = soup.find("time")
            if time_tag:
                date_str = time_tag.get("datetime") or time_tag.get("content")

        if date_str:
            return self._parse_date(date_str.strip())
        return None

    def _parse_date(self, date_str: str) -> datetime | None:
        """Parse a date string in various formats."""
        formats = [
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f%z",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%d",
            "%B %d, %Y",
            "%b %d, %Y",
            "%d %B %Y",
            "%d %b %Y",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        logger.debug("Could not parse date", date_str=date_str)
        return None

    def _extract_body(self, soup: BeautifulSoup) -> str:
        """Extract article body text, removing navigation/ads/scripts."""
        # Remove non-content elements
        for tag in soup.find_all(
            ["script", "style", "nav", "header", "footer", "aside", "iframe"]
        ):
            if isinstance(tag, Tag):
                tag.decompose()

        # Try common article body selectors
        selectors = [
            {"itemprop": "articleBody"},
            {"class_": re.compile(r"article-body|post-content|entry-content|story-body")},
            {"class_": re.compile(r"article__body|content-body")},
        ]

        for selector in selectors:
            body = soup.find(attrs=selector)
            if body and isinstance(body, Tag):
                text = body.get_text(separator="\n", strip=True)
                if len(text) > 100:
                    return self._clean_text(text)

        # Fallback: use <article> tag
        article = soup.find("article")
        if article:
            # Remove non-paragraph elements within article
            for tag in article.find_all(
                ["nav", "aside", "footer", "figure", "img", "video"]
            ):
                if isinstance(tag, Tag):
                    tag.decompose()
            text = article.get_text(separator="\n", strip=True)
            if len(text) > 100:
                return self._clean_text(text)

        # Last resort: all <p> tags
        paragraphs = soup.find_all("p")
        text = "\n\n".join(p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True))
        return self._clean_text(text)

    def _extract_description(self, soup: BeautifulSoup) -> str:
        """Extract article description/summary."""
        # OpenGraph description
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            return og_desc["content"].strip()

        # Meta description
        meta_desc = soup.find("meta", attrs={"name": "description"})
        if meta_desc and meta_desc.get("content"):
            return meta_desc["content"].strip()

        return ""

    def _extract_metadata(self, soup: BeautifulSoup) -> dict[str, str]:
        """Extract additional metadata from the page."""
        metadata: dict[str, str] = {}

        # OpenGraph tags
        for meta in soup.find_all("meta", property=True):
            prop = meta.get("property", "")
            content = meta.get("content", "")
            if prop and content and isinstance(prop, str) and isinstance(content, str):
                metadata[f"og:{prop}"] = content

        return metadata

    def _clean_text(self, text: str) -> str:
        """Clean extracted text."""
        # Collapse multiple blank lines
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Remove leading/trailing whitespace per line
        lines = [line.strip() for line in text.splitlines()]
        return "\n".join(line for line in lines if line)
