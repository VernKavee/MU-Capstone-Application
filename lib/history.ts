// History (REQUIREMENTS section 5), the plain-data part: which local day a set or workout
// falls on, the week the charts cover, and the mean similarity over sets. A day is the
// user's day: weeks run Monday to Sunday in the browser's time zone (Phase 0), which
// reaches the server in the tz cookie. Node-testable, so imports carry .ts extensions.
import type { Similarity } from "./set.ts";

export const TZ_COOKIE = "tz";
const DAY_MS = 86_400_000;
// A week plus a day: covers local Monday from any zone, across a DST change too.
export const WEEK_FETCH_MS = 8 * DAY_MS;

// The cookie's zone when it names a real one, else the server's own until the browser
// has sent it (app/(app)/time-zone.tsx).
export function timeZone(cookie: string | undefined): string {
  if (cookie) {
    try {
      return new Intl.DateTimeFormat("en", { timeZone: cookie }).resolvedOptions().timeZone;
    } catch {
      // not a zone: fall back below
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// The local calendar date of an instant, YYYY-MM-DD.
export function localDate(at: string | Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Monday to Sunday of the local week holding `now`. The arithmetic runs on the local date
// alone, so no DST offset gets in the way.
export function weekDays(now: Date, tz: string): string[] {
  const today = Date.parse(`${localDate(now, tz)}T00:00:00Z`);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

// The mean of the sets' overall similarity, initial and repair alike (ADR-0004), over the
// sets that have one. Null while none is scored.
export function meanSimilarity(similarities: (Similarity | null)[]): number | null {
  const scored = similarities.flatMap((s) => (typeof s?.overall === "number" ? [s.overall] : []));
  return scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
}

export type Day = { date: string; mean: number | null; sets: number };

// Level 1: each day of the week with the mean similarity over that day's sets.
export function weeklySummary(days: string[], sets: { started_at: string; similarity: Similarity | null }[], tz: string): Day[] {
  const dated = sets.map((s) => ({ date: localDate(s.started_at, tz), similarity: s.similarity }));
  return days.map((date) => {
    const mine = dated.filter((s) => s.date === date);
    return { date, mean: meanSimilarity(mine.map((s) => s.similarity)), sets: mine.length };
  });
}

// Level 2: per exercise, the days of the week with a finished workout, dated by its start.
// The caller passes finished workouts only (Phase 5: a workout left part way is no active day).
export function activeDays(days: string[], workouts: { exercise_id: string; started_at: string }[], tz: string): Map<string, Set<string>> {
  const week = new Set(days);
  const active = new Map<string, Set<string>>();
  for (const w of workouts) {
    const date = localDate(w.started_at, tz);
    if (week.has(date)) active.set(w.exercise_id, (active.get(w.exercise_id) ?? new Set()).add(date));
  }
  return active;
}
