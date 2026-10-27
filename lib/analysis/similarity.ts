// Similarity (ADR-0007): Punnapat's service in services/similarity/, reached over HTTP at
// SIMILARITY_URL. Without that setting (development, the end-to-end tests) a stub answers in the
// same shape with believable numbers shaped by the outcome the engine decided; no motion is compared.
import { BODY_PARTS, type BodyPart, type BodyPartScores, type SetSimilarity } from "../set.ts";
import type { SimilarityInput, SimilarityOutput } from "./contracts.ts";

export async function scoreSimilarity(input: SimilarityInput, random: () => number = Math.random): Promise<SimilarityOutput> {
  const url = process.env.SIMILARITY_URL;
  if (!url) return stub(input, random);
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`the similarity service answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return fromService((await res.json()) as ServiceOutput);
}

// The part of the service's SimilarityOutput the app reads (similarity_service.py documents all of it).
export type ServiceOutput = {
  status: "ok" | "partial" | "error";
  error: string | null;
  summary: { mean_score: number | null; weakest_body_part: string | null; body_parts: Record<string, number> | null };
  attempts: {
    attempt_no: number;
    outcome: string;
    score: number | null;
    skipped_reason: string | null;
    body_parts: Record<string, number>;
    score_parts: string[];
    tracking_confidence: number | null;
    warnings: string[];
  }[];
  model: { id: string };
};

// Keeps only the parts each rep is scored on, so a squat never shows an arm. A rep the service
// could not score keeps its reason; an abandoned one is left out. "error" throws, so the set is
// kept without similarity and offers a retry (ADR-0007).
export function fromService(out: ServiceOutput): SimilarityOutput {
  if (out.status === "error" || out.summary.mean_score === null) throw new Error(out.error ?? "the similarity service scored no rep");
  const counted = new Set<string>();
  const attempts = out.attempts
    .filter((a) => a.outcome !== "abandoned")
    .map((a) => {
      if (a.score !== null) a.score_parts.forEach((p) => counted.add(p));
      return {
        attempt_no: a.attempt_no,
        similarity: {
          score: a.score,
          body_parts: a.score === null ? {} : pick(a.body_parts, a.score_parts),
          skipped_reason: a.skipped_reason,
          warnings: a.warnings,
          tracking_confidence: a.tracking_confidence,
        },
      };
    });
  const set: SetSimilarity = {
    mean_score: out.summary.mean_score,
    body_parts: pick(out.summary.body_parts ?? {}, [...counted]),
    weakest_body_part: (out.summary.weakest_body_part as BodyPart | null) ?? null,
    model: out.model.id,
  };
  return { attempts, set };
}

const pick = (scores: Record<string, number>, parts: string[]): BodyPartScores =>
  Object.fromEntries(BODY_PARTS.filter((p) => parts.includes(p) && typeof scores[p] === "number").map((p) => [p, scores[p]]));

// The stub's parts per exercise, as the service counts them; the curl counts the chosen arm.
const STUB_PARTS: Record<string, BodyPart[]> = {
  squat: ["torso", "left_leg", "right_leg"],
  lunge: ["torso", "left_leg", "right_leg"],
  pushup: ["torso", "left_arm", "right_arm"],
};

function stub(input: SimilarityInput, random: () => number): SimilarityOutput {
  const parts = STUB_PARTS[input.exercise_key] ?? [input.side === "left" ? "left_arm" : "right_arm"];
  const attempts = input.attempts
    .filter((a) => a.outcome !== "abandoned")
    .map((a) => {
      const base = a.outcome === "correct" ? 80 + random() * 15 : 45 + random() * 25;
      const body_parts: BodyPartScores = Object.fromEntries(parts.map((p) => [p, round1(clamp(base + (random() - 0.5) * 14))]));
      const score = round1(mean(parts.map((p) => body_parts[p]!)));
      return { attempt_no: a.attempt_no, similarity: { score, body_parts, skipped_reason: null, warnings: [], tracking_confidence: 0.95 } };
    });
  const body_parts: BodyPartScores = Object.fromEntries(parts.map((p) => [p, round1(mean(attempts.map((a) => a.similarity.body_parts[p]!)))]));
  return {
    attempts,
    set: {
      mean_score: round1(mean(attempts.map((a) => a.similarity.score))),
      body_parts,
      weakest_body_part: attempts.length ? parts.reduce((lo, p) => (body_parts[p]! < body_parts[lo]! ? p : lo)) : null,
      model: "stub",
    },
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
