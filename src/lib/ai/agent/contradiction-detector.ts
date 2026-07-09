/**
 * Contradiction Detector
 * Identifies factual contradictions across signals for the same company
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface Contradiction {
  fact1: string;
  fact2: string;
  signal1Id: string;
  signal2Id: string;
  type: "directional_opposition" | "numerical_contradiction" | "temporal_conflict" | "entity_conflict";
  severity: number; // 0-1, higher = more severe
}

export interface ContradictionDetectionResult {
  contradictions: Contradiction[];
  signalCount: number;
}

/**
 * Detect contradictions across all signals for a company
 */
export async function detectContradictions(
  companyId: string
): Promise<ContradictionDetectionResult> {
  const log = logger.child({ companyId, function: "detectContradictions" });

  try {
    // Load all analyzed signals for this company
    const signals = await prisma.signal.findMany({
      where: {
        companyId,
        status: "ANALYZED",
      },
      take: 200,
      select: {
        id: true,
        title: true,
        analyses: {
          select: {
            keyFacts: true,
          },
        },
      },
    });

    if (signals.length < 2) {
      log.info("contradiction_detection.insufficient_signals", {
        signalCount: signals.length,
      });
      return { contradictions: [], signalCount: signals.length };
    }

    // Extract all facts with their signal IDs
    const factsBySignal: Array<{
      signalId: string;
      fact: string;
      embedding?: number[];
    }> = [];

    for (const signal of signals) {
      for (const analysis of signal.analyses) {
        const keyFacts = analysis.keyFacts as Array<{ text: string }>;
        if (!Array.isArray(keyFacts)) continue;

        for (const fact of keyFacts) {
          if (fact.text) {
            factsBySignal.push({
              signalId: signal.id,
              fact: fact.text,
            });
          }
        }
      }
    }

    if (factsBySignal.length < 2) {
      log.info("contradiction_detection.insufficient_facts", {
        factCount: factsBySignal.length,
      });
      return { contradictions: [], signalCount: signals.length };
    }

    const contradictions: Contradiction[] = [];

    // Cap facts to prevent O(n^2) blowup with many signals
    const MAX_FACTS_FOR_COMPARISON = 500;
    let cappedFactsBySignal = factsBySignal;
    if (factsBySignal.length > MAX_FACTS_FOR_COMPARISON) {
      log.info("contradiction_detection.facts_capped", {
        originalCount: factsBySignal.length,
        cappedCount: MAX_FACTS_FOR_COMPARISON,
      });
      cappedFactsBySignal = factsBySignal.slice(0, MAX_FACTS_FOR_COMPARISON);
    }

    // Compare all pairs of facts from different signals
    for (let i = 0; i < cappedFactsBySignal.length; i++) {
      for (let j = i + 1; j < cappedFactsBySignal.length; j++) {
        const fact1 = cappedFactsBySignal[i];
        const fact2 = cappedFactsBySignal[j];

        // Skip if from the same signal
        if (fact1.signalId === fact2.signalId) continue;

        // Check for contradiction
        const contradiction = await checkContradiction(fact1, fact2);
        if (contradiction) {
          contradictions.push(contradiction);
        }
      }
    }

    log.info("contradiction_detection.complete", {
      factCount: factsBySignal.length,
      contradictionCount: contradictions.length,
    });

    return {
      contradictions,
      signalCount: signals.length,
    };
  } catch (error) {
    log.error("contradiction_detection.error", { error: String(error) });
    return { contradictions: [], signalCount: 0 };
  }
}

/**
 * Check if two facts contradict each other
 */
async function checkContradiction(
  fact1: { signalId: string; fact: string },
  fact2: { signalId: string; fact: string }
): Promise<Contradiction | null> {
  // Check for directional opposition
  const directional = checkDirectionalOpposition(fact1, fact2);
  if (directional) return directional;

  // Check for numerical contradictions
  const numerical = checkNumericalContradiction(fact1, fact2);
  if (numerical) return numerical;

  // Check for temporal conflicts
  const temporal = checkTemporalConflict(fact1, fact2);
  if (temporal) return temporal;

  // Check for entity conflicts
  const entity = checkEntityConflict(fact1, fact2);
  if (entity) return entity;

  return null;
}

/**
 * Check for directional opposition (e.g., "revenue increased" vs "revenue decreased")
 */
function checkDirectionalOpposition(
  fact1: { signalId: string; fact: string },
  fact2: { signalId: string; fact: string }
): Contradiction | null {
  const increaseWords = [
    "increased", "grew", "rose", "up", "higher", "expanded", "improved",
    "surged", "jumped", "climbed", "boosted", "accelerated"
  ];
  
  const decreaseWords = [
    "decreased", "fell", "dropped", "down", "lower", "contracted", "declined",
    "plunged", "slid", "slipped", "weakened", "slowed"
  ];

  const fact1Lower = fact1.fact.toLowerCase();
  const fact2Lower = fact2.fact.toLowerCase();

  const fact1Increases = increaseWords.some(w => fact1Lower.includes(w));
  const fact1Decreases = decreaseWords.some(w => fact1Lower.includes(w));
  const fact2Increases = increaseWords.some(w => fact2Lower.includes(w));
  const fact2Decreases = decreaseWords.some(w => fact2Lower.includes(w));

  // Check for opposite directions
  if ((fact1Increases && fact2Decreases) || (fact1Decreases && fact2Increases)) {
    // Calculate severity based on semantic similarity
    const similarity = calculateSimpleSimilarity(fact1.fact, fact2.fact);
    if (similarity > 0.3) {
      return {
        fact1: fact1.fact,
        fact2: fact2.fact,
        signal1Id: fact1.signalId,
        signal2Id: fact2.signalId,
        type: "directional_opposition",
        severity: Math.min(1, similarity * 1.5),
      };
    }
  }

  return null;
}

/**
 * Check for numerical contradictions (e.g., "revenue of $10M" vs "revenue of $5M")
 */
function checkNumericalContradiction(
  fact1: { signalId: string; fact: string },
  fact2: { signalId: string; fact: string }
): Contradiction | null {
  // Extract numbers from facts
  const num1 = extractNumbers(fact1.fact);
  const num2 = extractNumbers(fact2.fact);

  if (num1.length === 0 || num2.length === 0) return null;

  // Check if facts are about the same metric (simple heuristic)
  const similarity = calculateSimpleSimilarity(fact1.fact, fact2.fact);
  if (similarity < 0.4) return null;

  // Look for significantly different numbers
  for (const n1 of num1) {
    for (const n2 of num2) {
      if (n1 === n2) continue;
      
      const diff = Math.abs(n1 - n2);
      const max = Math.max(n1, n2);
      const ratio = diff / max;

      // If numbers differ by more than 50%, it's a contradiction
      if (ratio > 0.5) {
        return {
          fact1: fact1.fact,
          fact2: fact2.fact,
          signal1Id: fact1.signalId,
          signal2Id: fact2.signalId,
          type: "numerical_contradiction",
          severity: Math.min(1, ratio),
        };
      }
    }
  }

  return null;
}

/**
 * Check for temporal conflicts (e.g., "launched in Q1" vs "launched in Q3")
 */
function checkTemporalConflict(
  fact1: { signalId: string; fact: string },
  fact2: { signalId: string; fact: string }
): Contradiction | null {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];

  const fact1Lower = fact1.fact.toLowerCase();
  const fact2Lower = fact2.fact.toLowerCase();

  // Check for quarter conflicts
  const fact1Quarters = quarters.filter(q => fact1Lower.includes(q.toLowerCase()));
  const fact2Quarters = quarters.filter(q => fact2Lower.includes(q.toLowerCase()));

  if (fact1Quarters.length > 0 && fact2Quarters.length > 0) {
    const commonQuarters = fact1Quarters.filter(q => fact2Quarters.includes(q));
    if (commonQuarters.length === 0) {
      const similarity = calculateSimpleSimilarity(fact1.fact, fact2.fact);
      if (similarity > 0.4) {
        return {
          fact1: fact1.fact,
          fact2: fact2.fact,
          signal1Id: fact1.signalId,
          signal2Id: fact2.signalId,
          type: "temporal_conflict",
          severity: 0.8,
        };
      }
    }
  }

  // Check for month conflicts
  const fact1Months = months.filter(m => fact1Lower.includes(m));
  const fact2Months = months.filter(m => fact2Lower.includes(m));

  if (fact1Months.length > 0 && fact2Months.length > 0) {
    const commonMonths = fact1Months.filter(m => fact2Months.includes(m));
    if (commonMonths.length === 0) {
      const similarity = calculateSimpleSimilarity(fact1.fact, fact2.fact);
      if (similarity > 0.4) {
        return {
          fact1: fact1.fact,
          fact2: fact2.fact,
          signal1Id: fact1.signalId,
          signal2Id: fact2.signalId,
          type: "temporal_conflict",
          severity: 0.7,
        };
      }
    }
  }

  return null;
}

/**
 * Check for entity conflicts (e.g., "CEO John Smith" vs "CEO Jane Doe")
 */
function checkEntityConflict(
  fact1: { signalId: string; fact: string },
  fact2: { signalId: string; fact: string }
): Contradiction | null {
  // Look for role + name patterns
  const roles = ["CEO", "CFO", "CTO", "COO", "president", "director", "chairman"];
  
  const fact1Lower = fact1.fact.toLowerCase();
  const fact2Lower = fact2.fact.toLowerCase();

  for (const role of roles) {
    const fact1HasRole = fact1Lower.includes(role.toLowerCase());
    const fact2HasRole = fact2Lower.includes(role.toLowerCase());

    if (fact1HasRole && fact2HasRole) {
      // Both mention the same role - check if they're talking about different people
      const similarity = calculateSimpleSimilarity(fact1.fact, fact2.fact);
      
      // If similarity is moderate (facts are about same topic but different details)
      if (similarity > 0.4 && similarity < 0.8) {
        return {
          fact1: fact1.fact,
          fact2: fact2.fact,
          signal1Id: fact1.signalId,
          signal2Id: fact2.signalId,
          type: "entity_conflict",
          severity: 0.9,
        };
      }
    }
  }

  return null;
}

/**
 * Extract numbers from text
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Calculate simple word overlap similarity
 */
function calculateSimpleSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}
