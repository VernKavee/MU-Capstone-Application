import Link from "next/link";
import { activeDays, lastSevenDays, WEEK_FETCH_MS } from "@/lib/history";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";

// Level 2 (REQUIREMENTS section 5): per exercise, the active days among the last seven,
// the same seven days as the Home chart. Fetches the catalogue's names and the start times
// of the finished workouts in the window, nothing else.
export default async function HistoryPage() {
  const supabase = await createClient();
  const tz = await userTimeZone();
  const now = new Date();
  const [{ data: exercises }, { data: workouts }] = await Promise.all([
    supabase.from("exercises").select("id, name").order("sort_order").throwOnError(),
    supabase
      .from("workouts")
      .select("exercise_id, started_at")
      .not("ended_at", "is", null)
      .gte("started_at", new Date(now.getTime() - WEEK_FETCH_MS).toISOString())
      .throwOnError(),
  ]);
  const days = lastSevenDays(now, tz);
  const active = activeDays(days, workouts, tz);
  const dayName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="text-sm opacity-70">Days with a finished workout in the last 7 days, today on the right.</p>
      </header>
      {/* The first thing a new user sees here (Phase 6). The exercises stay listed below:
          each still leads to its workouts from before these 7 days. */}
      {active.size === 0 && (
        <p className="rounded-lg bg-foreground/5 p-4">
          No finished workouts in the last 7 days. Each workout you finish marks its day below.{" "}
          <Link href="/" className="underline">
            Start a workout
          </Link>
        </p>
      )}
      <ul className="space-y-3">
        {exercises.map((exercise) => {
          const on = active.get(exercise.id) ?? new Set<string>();
          return (
            <li key={exercise.id}>
              <Link href={`/history/${exercise.id}`} className="block space-y-3 rounded-lg border p-4 hover:border-foreground">
                <span className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">{exercise.name}</span>
                  <span className="text-sm">
                    <span className="font-semibold tabular-nums">{on.size}</span> active {on.size === 1 ? "day" : "days"}
                    {on.size > 0 && <span className="sr-only">: {[...on].map(dayName).join(", ")}</span>}
                  </span>
                </span>
                <span aria-hidden className="grid grid-cols-7 gap-1">
                  {days.map((date) => (
                    <span key={date} className={`h-2 rounded-sm ${on.has(date) ? "bg-foreground" : "bg-foreground/10"}`} />
                  ))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
