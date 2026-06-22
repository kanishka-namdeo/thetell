/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedditFinancialScraper } from '../reddit-financial-scraper';

describe('RedditFinancialScraper - Engagement Preservation', () => {
  let scraper: RedditFinancialScraper;

  beforeEach(() => {
    scraper = new RedditFinancialScraper();
  });

  it('extracts engagement data from RSS feed', async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Test Post About AAPL</title>
    <link href="https://reddit.com/r/investing/abc123"/>
    <content>Score: 5000, Comments: 200, Upvote ratio: 95%</content>
    <published>2024-01-19T12:00:00Z</published>
    <id>abc123</id>
    <author><name>testuser</name></author>
  </entry>
</feed>`;

    vi.spyOn(scraper as any, 'fetch').mockResolvedValue(mockRSS);

    const signals = await scraper.scrape(['aapl']);

    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].engagement).toEqual({
      score: 5000,
      comments: 200,
      upvoteRatio: 0.95,
    });
  });

  it('extracts author from RSS feed', async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Test Post</title>
    <link href="https://reddit.com/r/wallstreetbets/xyz789"/>
    <content>Score: 1000, Comments: 50, Upvote ratio: 88%</content>
    <published>2024-01-19T12:00:00Z</published>
    <id>xyz789</id>
    <author><name>deepfuckingvalue</name></author>
  </entry>
</feed>`;

    vi.spyOn(scraper as any, 'fetch').mockResolvedValue(mockRSS);

    const signals = await scraper.scrape();

    expect(signals[0].author).toBe('deepfuckingvalue');
  });

  it('extracts metadata including subreddit and postId', async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>TSLA to the moon</title>
    <link href="https://reddit.com/r/wallstreetbets/def456"/>
    <content>Score: 10000, Comments: 500, Upvote ratio: 97%</content>
    <published>2024-01-19T12:00:00Z</published>
    <id>def456</id>
    <author><name>elonmusk</name></author>
  </entry>
</feed>`;

    vi.spyOn(scraper as any, 'fetch').mockResolvedValue(mockRSS);

    const signals = await scraper.scrape();

    expect(signals[0].metadata).toMatchObject({
      subreddit: 'wallstreetbets',
      postId: 'def456',
    });
  });

  it('handles missing engagement data gracefully', async () => {
    const mockRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Post without engagement</title>
    <link href="https://reddit.com/r/stocks/ghi789"/>
    <content>No engagement metrics here</content>
    <published>2024-01-19T12:00:00Z</published>
    <id>ghi789</id>
    <author><name>anon</name></author>
  </entry>
</feed>`;

    vi.spyOn(scraper as any, 'fetch').mockResolvedValue(mockRSS);

    const signals = await scraper.scrape();

    expect(signals[0].engagement).toEqual({
      score: 0,
      comments: 0,
      upvoteRatio: 0,
    });
  });
});
