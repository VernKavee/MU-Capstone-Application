import { SubmitButton } from "../../../../submit-button";
import { retryFeedback } from "./actions";

// The button for a set without feedback, on the finished summary and on History level 4,
// with the last try's error when it failed. The service can take up to a minute.
export function RetryFeedback({ exercise, workout, set, from, error }: { exercise: string; workout: string; set: string; from: "done" | "history"; error?: string }) {
  return (
    <form action={retryFeedback} className="space-y-2">
      <input type="hidden" name="exercise" value={exercise} />
      <input type="hidden" name="workout" value={workout} />
      <input type="hidden" name="set" value={set} />
      <input type="hidden" name="from" value={from} />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <SubmitButton pendingText="Writing feedback, up to a minute" className="btn-quiet">
        Write feedback now
      </SubmitButton>
    </form>
  );
}
