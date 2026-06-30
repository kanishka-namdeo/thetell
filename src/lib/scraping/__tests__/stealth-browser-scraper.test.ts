/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StealthBrowserScraper } from '../stealth-browser-scraper';

// Mock external dependencies
vi.mock('cloakbrowser', () => ({
  launch: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

describe('StealthBrowserScraper', () => {
  let scraper: StealthBrowserScraper;
  let mockPage: any;
  let mockBrowser: any;
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    scraper = new StealthBrowserScraper();

    mockPage = {
      goto: vi.fn(),
      content: vi.fn(),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };

    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isEnabled', () => {
    it('returns true by default', () => {
      expect(scraper.isEnabled()).toBe(true);
    });

    it('returns false when STEALTH_SCRAPER_ENABLED is false', () => {
      const original = process.env.STEALTH_SCRAPER_ENABLED;
      process.env.STEALTH_SCRAPER_ENABLED = 'false';
      const disabledScraper = new StealthBrowserScraper();
      expect(disabledScraper.isEnabled()).toBe(false);
      if (original !== undefined) {
        process.env.STEALTH_SCRAPER_ENABLED = original;
      } else {
        delete process.env.STEALTH_SCRAPER_ENABLED;
      }
    });
  });

  describe('fetch', () => {
    it('returns null when disabled', async () => {
      const original = process.env.STEALTH_SCRAPER_ENABLED;
      process.env.STEALTH_SCRAPER_ENABLED = 'false';
      const disabledScraper = new StealthBrowserScraper();

      const result = await disabledScraper.fetch('https://example.com');
      expect(result).toBeNull();

      if (original !== undefined) {
        process.env.STEALTH_SCRAPER_ENABLED = original;
      } else {
        delete process.env.STEALTH_SCRAPER_ENABLED;
      }
    });

    it('returns null on navigation failure', async () => {
      const { launch } = await import('cloakbrowser');
      vi.mocked(launch).mockResolvedValue(mockBrowser as any);
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));

      const result = await scraper.fetch('https://example.com');

      expect(result).toBeNull();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('extracts HTML content on success', async () => {
      const { launch } = await import('cloakbrowser');
      vi.mocked(launch).mockResolvedValue(mockBrowser as any);
      mockPage.goto.mockResolvedValue(null);

      const htmlContent = '<html><body><p>Test content</p></body></html>';
      mockPage.content.mockResolvedValue(htmlContent);

      const result = await scraper.fetch('https://example.com');

      expect(result).toBe(htmlContent);
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
      expect(mockPage.content).toHaveBeenCalled();
      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('closes browser in finally block even on error', async () => {
      const { launch } = await import('cloakbrowser');
      vi.mocked(launch).mockResolvedValue(mockBrowser as any);
      mockPage.goto.mockRejectedValue(new Error('Crash'));

      await scraper.fetch('https://example.com');

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('scrapeArticle', () => {
    it('returns null when fetch returns null', async () => {
      const { launch } = await import('cloakbrowser');
      vi.mocked(launch).mockResolvedValue(mockBrowser as any);
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));

      const result = await scraper.scrapeArticle('https://example.com/article');
      expect(result).toBeNull();
    });

    it('extracts ArticleData from rendered HTML', async () => {
      const { launch } = await import('cloakbrowser');
      vi.mocked(launch).mockResolvedValue(mockBrowser as any);
      mockPage.goto.mockResolvedValue(null);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Article Title</title>
            <meta property="og:title" content="Test Article Title" />
            <meta property="article:author" content="John Doe" />
            <meta property="article:published_time" content="2024-01-15T10:00:00Z" />
            <meta property="og:description" content="Test description" />
          </head>
          <body>
            <article>
              <div class="article-body">
                <p>This is the first paragraph of the test article. It contains substantial content for testing purposes.</p>
                <p>This is the second paragraph with more content to ensure we exceed the minimum length requirements.</p>
                <p>This is the third paragraph to make sure we have enough text for the extraction to work properly.</p>
              </div>
            </article>
          </body>
        </html>
      `;
      mockPage.content.mockResolvedValue(htmlContent);

      const result = await scraper.scrapeArticle('https://example.com/article');

      expect(result).not.toBeNull();
      expect(result?.url).toBe('https://example.com/article');
      expect(result?.title).toBe('Test Article Title');
      expect(result?.author).toBe('John Doe');
      expect(result?.publishedAt).toBeInstanceOf(Date);
      expect(result?.bodyText).toContain('first paragraph');
      expect(result?.description).toBe('Test description');
    });

    it('normalizes URL by stripping hash and search params', async () => {
      const { launch } = await import('cloakbrowser');
      vi.mocked(launch).mockResolvedValue(mockBrowser as any);
      mockPage.goto.mockResolvedValue(null);
      mockPage.content.mockResolvedValue(`
        <html>
          <head><title>Test</title></head>
          <body><article><p>This is test content that is long enough to pass the minimum length requirement for extraction to work properly in this test.</p></article></body>
        </html>
      `);

      const result = await scraper.scrapeArticle('https://example.com/article?utm_source=test#section');

      expect(result?.url).toBe('https://example.com/article');
    });

    it('uses cache for repeated URLs', async () => {
      const { launch } = await import('cloakbrowser');
      vi.mocked(launch).mockResolvedValue(mockBrowser as any);
      mockPage.goto.mockResolvedValue(null);
      mockPage.content.mockResolvedValue(`
        <html>
          <head><title>Cached Article</title></head>
          <body><article><p>This is cached content that is long enough to pass the minimum length requirement for extraction.</p></article></body>
        </html>
      `);

      const store = new Map<string, any>();
      const cacheGetSpy = vi.spyOn(scraper['cache'], 'get').mockImplementation(async (key: string) => store.get(key) ?? null);
      const cacheSetSpy = vi.spyOn(scraper['cache'], 'set').mockImplementation(async (key: string, value: any) => {
        store.set(key, value);
      });

      await scraper.scrapeArticle('https://example.com/article');
      await scraper.scrapeArticle('https://example.com/article');

      expect(cacheGetSpy).toHaveBeenCalledTimes(2);
      expect(cacheSetSpy).toHaveBeenCalledTimes(1);
      expect(launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('scraperName', () => {
    it('returns stealth-browser', () => {
      expect(scraper.scraperName).toBe('stealth-browser');
    });
  });
});
