/**
 * Test 5: Source-type signal weighting.
 *
 * Tests that calculateSignalWeight applies correct base weights
 * and engagement-based boosts for different source types.
 *
 * NOTE: calculateSignalWeight only uses engagement.score (not comments)
 * for the SOCIAL engagement multiplier.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from "vitest";
import { calculateSignalWeight } from "@/lib/ai/confidence";

describe("calculateSignalWeight", () => {
  describe("base weights by source type", () => {
    it("returns 1.0 for FILING", () => {
      expect(calculateSignalWeight("FILING")).toBe(1.0);
    });

    it("returns 0.95 for TRANSCRIPT", () => {
      expect(calculateSignalWeight("TRANSCRIPT")).toBe(0.95);
    });

    it("returns 0.90 for NEWS", () => {
      expect(calculateSignalWeight("NEWS")).toBe(0.90);
    });

    it("returns 0.50 for SOCIAL (base weight)", () => {
      expect(calculateSignalWeight("SOCIAL")).toBe(0.50);
    });

    it("returns 0.80 for BLOG", () => {
      expect(calculateSignalWeight("BLOG")).toBe(0.80);
    });

    it("returns 0.60 for JOB_POSTING", () => {
      expect(calculateSignalWeight("JOB_POSTING")).toBe(0.60);
    });

    it("returns 0.50 default for unknown source type", () => {
      expect(calculateSignalWeight("UNKNOWN_TYPE" as any)).toBe(0.50);
    });
  });

  describe("SOCIAL engagement boost (uses score only)", () => {
    it("returns base weight when engagement is null", () => {
      expect(calculateSignalWeight("SOCIAL", null)).toBe(0.50);
    });

    it("returns base weight when engagement is undefined", () => {
      expect(calculateSignalWeight("SOCIAL", undefined)).toBe(0.50);
    });

    it("boosts SOCIAL weight with low engagement (score: 10)", () => {
      // multiplier = min(2.0, 1 + log10(11) * 0.2) = min(2.0, 1.208) = 1.208
      // weight = 0.50 * 1.208 ≈ 0.604
      const weight = calculateSignalWeight("SOCIAL", { score: 10 });
      expect(weight).toBeGreaterThan(0.50);
      expect(weight).toBeCloseTo(0.604, 2);
    });

    it("boosts SOCIAL weight with high engagement (score: 10000)", () => {
      // multiplier = min(2.0, 1 + log10(10001) * 0.2) = min(2.0, 1.8) = 1.8
      // weight = 0.50 * 1.8 = 0.9
      const weight = calculateSignalWeight("SOCIAL", { score: 10000 });
      expect(weight).toBeCloseTo(0.9, 2);
    });

    it("caps engagement multiplier at 2.0 (max weight = 1.0)", () => {
      // multiplier = min(2.0, 1 + log10(10000001) * 0.2) = min(2.0, 2.4) = 2.0
      // weight = 0.50 * 2.0 = 1.0
      const weight = calculateSignalWeight("SOCIAL", { score: 10_000_000 });
      expect(weight).toBeCloseTo(1.0, 5);
    });

    it("returns base weight for SOCIAL with zero score", () => {
      // multiplier = min(2.0, 1 + log10(1) * 0.2) = 1.0
      // weight = 0.50 * 1.0 = 0.50
      const weight = calculateSignalWeight("SOCIAL", { score: 0 });
      expect(weight).toBeCloseTo(0.50, 5);
    });

    it("ignores non-numeric score values", () => {
      const weight = calculateSignalWeight("SOCIAL", { score: "high" as any });
      expect(weight).toBeCloseTo(0.50, 5);
    });

    it("comments field is ignored (only score matters)", () => {
      const withComments = calculateSignalWeight("SOCIAL", { score: 100, comments: 5000 });
      const withoutComments = calculateSignalWeight("SOCIAL", { score: 100, comments: 0 });
      expect(withComments).toBe(withoutComments);
    });
  });

  describe("non-SOCIAL source types ignore engagement", () => {
    it("does not boost NEWS weight even with engagement", () => {
      const baseWeight = calculateSignalWeight("NEWS");
      const withEngagement = calculateSignalWeight("NEWS", { score: 100000 });
      expect(withEngagement).toBe(baseWeight);
    });

    it("does not boost FILING weight even with engagement", () => {
      const baseWeight = calculateSignalWeight("FILING");
      const withEngagement = calculateSignalWeight("FILING", { score: 100000 });
      expect(withEngagement).toBe(baseWeight);
    });
  });

  describe("weight ordering", () => {
    it("FILING > TRANSCRIPT > NEWS > BLOG > SOCIAL (without engagement)", () => {
      const filing = calculateSignalWeight("FILING");
      const transcript = calculateSignalWeight("TRANSCRIPT");
      const news = calculateSignalWeight("NEWS");
      const blog = calculateSignalWeight("BLOG");
      const social = calculateSignalWeight("SOCIAL");

      expect(filing).toBeGreaterThan(transcript);
      expect(transcript).toBeGreaterThan(news);
      expect(news).toBeGreaterThan(blog);
      expect(blog).toBeGreaterThan(social);
    });

    it("SOCIAL with very high engagement can equal FILING weight", () => {
      const filing = calculateSignalWeight("FILING");
      const socialMax = calculateSignalWeight("SOCIAL", { score: 10_000_000 });
      // Max SOCIAL weight = 0.50 * 2.0 = 1.0, which equals FILING
      expect(socialMax).toBeCloseTo(filing, 5);
    });
  });
});
