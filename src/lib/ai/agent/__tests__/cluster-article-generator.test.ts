import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateClusterArticle } from '../cluster-article-generator';
import { ANALYST_CONFIG, GOSSIP_GIRL_CONFIG } from '../personas';
import * as provider from '../../provider';

// Mock the provider module
vi.mock('../../provider', () => ({
  getProvider: vi.fn(),
}));

describe('generateClusterArticle', () => {
  const mockCluster = {
    label: 'AI Investment Strategy',
    summary: 'Company is heavily investing in AI across multiple signals',
    signals: [
      {
        id: 'signal-1',
        title: 'Q4 Earnings Call',
        sourceType: 'TRANSCRIPT',
        facts: [
          'Revenue increased 25% year-over-year',
          'AI division grew 40% in Q4',
          'CEO announced $500M AI investment for 2024',
        ],
      },
      {
        id: 'signal-2',
        title: 'New AI Product Launch',
        sourceType: 'NEWS',
        facts: [
          'Launched AI-powered analytics platform',
          'Partnership with major cloud provider',
          'Targeting enterprise customers',
        ],
      },
      {
        id: 'signal-3',
        title: 'Hiring Spree in AI Division',
        sourceType: 'JOB_POSTING',
        facts: [
          'Posted 50+ AI/ML engineering positions',
          'Opening new AI research lab',
          'Competitive salaries indicating urgency',
        ],
      },
    ],
  };

  const mockCompany = {
    name: 'TechCorp Inc',
    ticker: 'TCOR',
  };

  const mockProvider = {
    completeStructured: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(provider.getProvider).mockReturnValue(mockProvider as any);
  });

  it('should generate cluster article with ANALYST persona', async () => {
    // Mock LLM responses
    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'TechCorp Doubles Down on AI with $500M Investment' })
      .mockResolvedValueOnce({
        summary: 'TechCorp is making a significant strategic bet on artificial intelligence, backed by a $500M investment commitment and rapid hiring across its AI division.',
      })
      .mockResolvedValueOnce({
        body: '## Key Findings\n\nTechCorp has committed $500M to AI investment in 2024, representing a strategic pivot toward artificial intelligence capabilities.\n\n## Evidence Accumulation\n\nThe earnings call revealed 40% growth in the AI division, while job postings indicate aggressive expansion with 50+ new positions. The product launch demonstrates execution capability.\n\n## Strategic Implications\n\nThis multi-signal pattern suggests TechCorp is positioning itself as an AI-first company, moving beyond traditional software offerings.',
      });

    const result = await generateClusterArticle(mockCluster, mockCompany, ANALYST_CONFIG);

    expect(result).toBeDefined();
    expect(result.title).toBe('TechCorp Doubles Down on AI with $500M Investment');
    expect(result.summary).toContain('strategic bet on artificial intelligence');
    expect(result.body).toContain('Key Findings');
    expect(result.body).toContain('$500M');
    expect(result.slug).toMatch(/^techcorp-doubles-down-on-ai-with-500m-investment-\d+$/);
    expect(result.groundingScore).toBeDefined();
    expect(result.groundingScore).toBeGreaterThanOrEqual(0);
    expect(result.groundingScore).toBeLessThanOrEqual(1);
  });

  it('should generate cluster article with GOSSIP_GIRL persona', async () => {
    // Mock LLM responses with different voice
    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'TechCorp Goes All-In on AI - But Can They Execute?' })
      .mockResolvedValueOnce({
        summary: "Everyone's talking about TechCorp's AI pivot, but the real story is in the details - and there are some interesting tells about what's really happening behind the scenes.",
      })
      .mockResolvedValueOnce({
        body: "## The Tell\n\nWhen a company posts 50+ AI positions while announcing a $500M investment, that's not just strategy - that's desperation to catch up. The competitive pressure is real.\n\n## Reading Between the Lines\n\nThe 40% AI division growth sounds impressive until you realize it's from a tiny base. The real question: is this organic growth or acquisition-fueled?\n\n## The Subtext\n\nThose competitive salaries in the job postings? That's the sound of a company trying to poach talent because they can't build it internally fast enough.",
      });

    const result = await generateClusterArticle(mockCluster, mockCompany, GOSSIP_GIRL_CONFIG);

    expect(result).toBeDefined();
    expect(result.title).toContain('All-In');
    expect(result.summary).toContain('tell');
    expect(result.body).toContain('The Tell');
    expect(result.body).toContain('Reading Between the Lines');
    expect(result.slug).toMatch(/^techcorp-goes-all-in-on-ai-but-can-they-execute-\d+$/);
  });

  it('should produce different content for different personas', async () => {
    // Mock different responses for each persona
    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'TechCorp AI Investment Analysis' })
      .mockResolvedValueOnce({ summary: 'Analyst summary about AI investment' })
      .mockResolvedValueOnce({ body: '## Analyst Perspective\n\nData-driven analysis of AI investment strategy.' });

    const analystResult = await generateClusterArticle(mockCluster, mockCompany, ANALYST_CONFIG);

    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'The Real Story Behind TechCorp\'s AI Push' })
      .mockResolvedValueOnce({ summary: 'Gossip Girl summary with insider perspective' })
      .mockResolvedValueOnce({ body: '## The Inside Scoop\n\nWhat they\'re really up to with this AI investment.' });

    const gossipResult = await generateClusterArticle(mockCluster, mockCompany, GOSSIP_GIRL_CONFIG);

    expect(analystResult.title).not.toBe(gossipResult.title);
    expect(analystResult.summary).not.toBe(gossipResult.summary);
    expect(analystResult.body).not.toBe(gossipResult.body);
  });

  it('should handle hallucination guard validation', async () => {
    // Mock response with some ungrounded claims
    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'TechCorp AI Strategy' })
      .mockResolvedValueOnce({ summary: 'Summary of AI strategy' })
      .mockResolvedValueOnce({
        body: '## Key Findings\n\n**TechCorp plans to acquire AI startup for $2B** (not in source signals)\n\nThe company invested $500M in AI (grounded in signal 1).',
      });

    const result = await generateClusterArticle(mockCluster, mockCompany, ANALYST_CONFIG);

    expect(result).toBeDefined();
    // Grounding score should be lower due to ungrounded claim
    expect(result.groundingScore).toBeLessThan(1);
  });

  it('should handle empty facts gracefully', async () => {
    const clusterWithEmptyFacts = {
      ...mockCluster,
      signals: [
        {
          id: 'signal-1',
          title: 'Earnings Call',
          sourceType: 'TRANSCRIPT',
          facts: [],
        },
      ],
    };

    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'TechCorp Earnings Summary' })
      .mockResolvedValueOnce({ summary: 'Summary of earnings' })
      .mockResolvedValueOnce({ body: '## Summary\n\nEarnings call discussed company performance.' });

    const result = await generateClusterArticle(clusterWithEmptyFacts, mockCompany, ANALYST_CONFIG);

    expect(result).toBeDefined();
    expect(result.title).toBe('TechCorp Earnings Summary');
  });

  it('should handle provider errors gracefully', async () => {
    mockProvider.completeStructured.mockRejectedValue(new Error('API rate limit exceeded'));

    await expect(
      generateClusterArticle(mockCluster, mockCompany, ANALYST_CONFIG)
    ).rejects.toThrow('API rate limit exceeded');
  });

  it('should validate grounding score is between 0 and 1', async () => {
    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'TechCorp AI Investment' })
      .mockResolvedValueOnce({ summary: 'Summary' })
      .mockResolvedValueOnce({
        body: '## Key Findings\n\n**$500M investment** and **40% growth** are grounded claims from the signals.',
      });

    const result = await generateClusterArticle(mockCluster, mockCompany, ANALYST_CONFIG);

    expect(result.groundingScore).toBeGreaterThanOrEqual(0);
    expect(result.groundingScore).toBeLessThanOrEqual(1);
  });

  it('should generate unique slugs with timestamps', async () => {
    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'Same Headline' })
      .mockResolvedValueOnce({ summary: 'Summary 1' })
      .mockResolvedValueOnce({ body: 'Body 1' });

    const result1 = await generateClusterArticle(mockCluster, mockCompany, ANALYST_CONFIG);

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    mockProvider.completeStructured
      .mockResolvedValueOnce({ headline: 'Same Headline' })
      .mockResolvedValueOnce({ summary: 'Summary 2' })
      .mockResolvedValueOnce({ body: 'Body 2' });

    const result2 = await generateClusterArticle(mockCluster, mockCompany, ANALYST_CONFIG);

    expect(result1.slug).not.toBe(result2.slug);
    expect(result1.slug).toMatch(/^same-headline-\d+$/);
    expect(result2.slug).toMatch(/^same-headline-\d+$/);
  });
});
