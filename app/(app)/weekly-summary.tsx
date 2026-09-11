import type { Day } from "@/lib/history";

// Local calendar dates, formatted in UTC so they stay on their own day.
const format = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });

const BAR_REM = 8.5; // a column at 100; the value label sits in the 1.5rem above it

// Level 1 (REQUIREMENTS section 5): the last seven days, today on the right, each day's
// mean similarity over its sets on a fixed 0 to 100 scale. Every column carries its value
// and its set count, so there is no axis and no tooltip. A day without sets has no column.
export function WeeklySummary({ days }: { days: Day[] }) {
  const empty = days.every((d) => d.sets === 0);
  return (
    <section aria-labelledby="week-title" className="rounded-2xl bg-black px-5 pb-4 pt-5 text-ink ring-1 ring-ink/10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="week-title" className="text-lg font-semibold">
          Last 7 days
        </h2>
        <p className="text-sm text-ink/60">
          {format(days[0].date, { day: "numeric", month: "short" })} to {format(days[6].date, { day: "numeric", month: "short" })}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-ink/60">{"Mean similarity to the expert motion over each day's sets, out of 100"}</p>

      <div className="relative mt-4">
        {/* The 100 line, so a short column reads as a low score and not as a zoomed axis. */}
        <div aria-hidden className="absolute inset-x-0 top-6 border-t border-ink/15" />
        <ol className="relative grid grid-cols-7">
          {days.map((day, i) => {
            const isToday = i === days.length - 1;
            return (
              <li key={day.date} className="flex flex-col items-center">
                <span className="sr-only">{describe(day, isToday)}</span>
                <div aria-hidden className="flex h-40 w-full flex-col items-center justify-end border-b border-ink/15">
                  {day.sets > 0 && <span className="mb-1 bg-black px-1 text-sm font-semibold leading-5">{day.mean ?? "–"}</span>}
                  {day.mean !== null && (
                    <span
                      className="block w-full max-w-6 origin-bottom rounded-t bg-tape motion-safe:animate-rise"
                      style={{ height: `${(day.mean / 100) * BAR_REM}rem`, animationDelay: `${i * 40}ms` }}
                    />
                  )}
                </div>
                <span aria-hidden className={`mt-2 text-xs ${isToday ? "font-semibold text-ink" : "text-ink/60"}`}>
                  {isToday ? "Today" : format(day.date, { weekday: "short" })}
                </span>
                <span aria-hidden className="h-4 text-[11px] leading-4 text-ink/60">
                  {day.sets > 0 && `${day.sets} ${day.sets === 1 ? "set" : "sets"}`}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      {empty && <p className="mt-3 text-sm text-ink/70">No sets in the last 7 days. Pick an exercise below to start one.</p>}
    </section>
  );
}

function describe(day: Day, isToday: boolean) {
  const date = `${format(day.date, { weekday: "long", day: "numeric", month: "long" })}${isToday ? ", today" : ""}`;
  if (day.sets === 0) return `${date}: no sets.`;
  const sets = `${day.sets} ${day.sets === 1 ? "set" : "sets"}`;
  return day.mean === null ? `${date}: ${sets}, not scored yet.` : `${date}: ${day.mean}% over ${sets}.`;
}
