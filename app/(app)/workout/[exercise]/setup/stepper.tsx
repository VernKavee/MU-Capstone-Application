"use client";

import { useRef } from "react";
import { Minus, Plus } from "../../../icons";

// One setup number with − and + beside it (2026-11-05, Vern, from the Daylight mockup), so a
// phone needs no keyboard for a small change. The field stays a plain number input in the
// form, typeable for a big jump, and the buttons only move its value within the limits.
export function Stepper({
  name,
  label,
  min,
  max,
  initial,
  by = 1,
}: {
  name: string;
  label: string;
  min: number;
  max: number;
  initial: number;
  by?: number; // what one tap adds; the field itself still takes any whole number
}) {
  const input = useRef<HTMLInputElement>(null);

  function move(sign: 1 | -1) {
    const el = input.current;
    if (!el) return;
    const now = Number.isFinite(el.valueAsNumber) ? el.valueAsNumber : initial;
    el.value = String(Math.min(max, Math.max(min, now + sign * by)));
  }

  const button = "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 hover:bg-line";
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-lg">
      <label htmlFor={name}>{label}</label>
      <span className="flex items-center gap-1.5">
        <button type="button" onClick={() => move(-1)} aria-label={`Less: ${label}`} className={button}>
          <Minus />
        </button>
        <input
          ref={input}
          id={name}
          name={name}
          type="number"
          inputMode="numeric"
          required
          min={min}
          max={max}
          defaultValue={initial}
          className="w-16 rounded-lg border border-line bg-surface px-1 py-1 text-center font-display text-3xl leading-none tabular-nums"
        />
        <button type="button" onClick={() => move(1)} aria-label={`More: ${label}`} className={button}>
          <Plus />
        </button>
      </span>
    </div>
  );
}
