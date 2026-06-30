/**
 * Persistent cache with TTL for scraping, backed by PostgreSQL via Prisma.
 *
 * Cache entries survive server restarts. Default TTL is 24 hours.
 * If the database is unavailable, cache operations degrade gracefully
 * (get returns null, set/delete/clear are no-ops).
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const DEFAULT_TTL = 86400; // 24 hours in seconds
const MAX_CACHE_SIZE = 1000; // Prevent unbounded cache growth

export class TTLCache<T = unknown> {
  private defaultTtl: number;

  constructor(defaultTtl: number = DEFAULT_TTL) {
    this.defaultTtl = defaultTtl;
  }

  /**
   * Get a cached value if it exists and hasn't expired.
   * Returns null on cache miss, expired entry, or DB error.
   */
  async get(key: string): Promise<T | null> {
    try {
      const entry = await prisma.scrapeCache.findUnique({
        where: { url: key },
      });

      if (!entry) {
        return null;
      }

      if (new Date() > entry.expiresAt) {
        await prisma.scrapeCache.delete({ where: { url: key } });
        return null;
      }

      return JSON.parse(entry.content) as T;
    } catch (error) {
      logger.warn("cache.get.failed", { key, error: String(error) });
      return null;
    }
  }

  /**
   * Store a value with an optional custom TTL (in seconds).
   * No-op if the database is unavailable.
   * Evicts oldest entries if cache exceeds MAX_CACHE_SIZE.
   */
  async set(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTtl = ttl ?? this.defaultTtl;
    const expiresAt = new Date(Date.now() + effectiveTtl * 1000);
    const content = JSON.stringify(value);

    try {
      // Check cache size and evict oldest entries if needed
      const count = await prisma.scrapeCache.count();
      if (count >= MAX_CACHE_SIZE) {
        const oldest = await prisma.scrapeCache.findFirst({
          orderBy: { createdAt: "asc" },
          select: { url: true },
        });
        if (oldest) {
          await prisma.scrapeCache.delete({ where: { url: oldest.url } });
        }
      }

      await prisma.scrapeCache.upsert({
        where: { url: key },
        update: { content, expiresAt },
        create: { url: key, content, expiresAt },
      });
    } catch (error) {
      logger.warn("cache.set.failed", { key, error: String(error) });
    }
  }

  /**
   * Remove a key from the cache. No-op if the database is unavailable.
   */
  async delete(key: string): Promise<void> {
    try {
      await prisma.scrapeCache.delete({ where: { url: key } });
    } catch (error) {
      logger.warn("cache.delete.failed", { key, error: String(error) });
    }
  }

  /**
   * Remove all entries from the cache. No-op if the database is unavailable.
   */
  async clear(): Promise<void> {
    try {
      await prisma.scrapeCache.deleteMany();
    } catch (error) {
      logger.warn("cache.clear.failed", { error: String(error) });
    }
  }

  /**
   * Remove expired entries and return count of removed items.
   * Returns 0 if the database is unavailable.
   */
  async cleanup(): Promise<number> {
    try {
      const result = await prisma.scrapeCache.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return result.count;
    } catch (error) {
      logger.warn("cache.cleanup.failed", { error: String(error) });
      return 0;
    }
  }
}
