"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

// A form's submit button, disabled while the form's server action runs, so a slow
// connection does not read as a dead button and a second press does not submit twice.
// pendingText replaces the label meanwhile; a form with two actions leaves it out, since
// the form's status does not say which button was pressed.
export function SubmitButton({ pendingText, children, className, ...props }: ComponentProps<"button"> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" {...props} disabled={pending} className={`disabled:opacity-60 ${className ?? ""}`}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
