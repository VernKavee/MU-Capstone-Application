// Similarity stub (ADR-0007). Punnapat's component replaces this file. Believable numbers
// shaped by the outcome the engine already decided; no motion is compared.
import { REGIONS, type Similarity } from "../set.ts";
import type { SimilarityInput, SimilarityOutput } from "./contracts.ts";

export async function scoreSimilarity(input: SimilarityInput, random: () => number = Math.random): Promise<SimilarityOutput> {
  const scored = input.attempts
    .filter((a) => a.outcome !== "abandoned")
    .map((a) => {
      const base = a.outcome === "correct" ? 86 + random() * 11 : 66 + random() * 18;
      const regions = Object.fromEntries(REGIONS.map((r) => [r, clamp(base + (random() - 0.5) * 14)])) as Record<(typeof REGIONS)[number], number>;
      const overall = Math.round(REGIONS.reduce((sum, r) => sum + regions[r], 0) / REGIONS.length);
      return { attempt_no: a.attempt_no, similarity: { overall, ...regions } };
    });
  const set = Object.fromEntries(
    ["overall", ...REGIONS].map((key) => [
      key,
      scored.length ? Math.round(scored.reduce((sum, s) => sum + s.similarity[key as keyof Similarity], 0) / scored.length) : 0,
    ]),
  ) as Similarity;
  return { attempts: scored, set };
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
