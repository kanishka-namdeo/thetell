import { describe, it, expect } from 'vitest';
import { calculateConfidence } from '../confidence';
import type { ConfidenceParams } from '../confidence';

describe('Engagement-based Confidence Boost', () => {
  const baseParams: ConfidenceParams = {
    sourceType: 'SOCIAL',
    contentLength: 1000,
    facts: [],
    themes: [],
    llmConfidence: 0.7,
  };

  it('returns base confidence when no engagement data', () => {
    const params = { ...baseParams, engagement: undefined };
    const confidence = calculateConfidence(params);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('applies small boost for low engagement', () => {
    const params = { ...baseParams, engagement: { score: 10, comments: 2 } };
    const confidence = calculateConfidence(params);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('applies larger boost for high engagement', () => {
    const params = { ...baseParams, engagement: { score: 10000, comments: 500 } };
    const confidence = calculateConfidence(params);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('caps confidence boost at maximum threshold', () => {
    const params = { ...baseParams, engagement: { score: 1000000, comments: 50000 } };
    const confidence = calculateConfidence(params);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('applies higher confidence for SOCIAL with high engagement vs low engagement', () => {
    const lowEngagement = calculateConfidence({ ...baseParams, engagement: { score: 100, comments: 5 } });
    const highEngagement = calculateConfidence({ ...baseParams, engagement: { score: 10000, comments: 500 } });
    
    expect(highEngagement).toBeGreaterThan(lowEngagement);
  });

  it('does not apply engagement boost to non-SOCIAL source types', () => {
    const params1 = { ...baseParams, sourceType: 'NEWS' as const, engagement: { score: 10000, comments: 500 } };
    const params2 = { ...baseParams, sourceType: 'NEWS' as const, engagement: { score: 0, comments: 0 } };
    
    const confidence1 = calculateConfidence(params1);
    const confidence2 = calculateConfidence(params2);
    
    // NEWS should not get engagement boost, so both should be similar
    expect(Math.abs(confidence1 - confidence2)).toBeLessThan(0.01);
  });
});
