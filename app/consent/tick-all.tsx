"use client";

// Fills the consent checkboxes. type="button" so it never submits; the user presses Continue.
export function TickAll() {
  return (
    <button
      type="button"
      onClick={(e) => e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((c) => (c.checked = true))}
      className="btn-quiet"
    >
      Tick both
    </button>
  );
}
