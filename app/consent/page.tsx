import { redirect } from "next/navigation";
import { signOut } from "../(auth)/actions";
import { SubmitButton } from "../submit-button";
import { grantConsents } from "./actions";
import { TickAll } from "./tick-all";
import { CONSENT_KINDS, CONSENT_VERSION } from "@/lib/consent";
import { gateState } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";

export default async function ConsentPage({ searchParams }: PageProps<"/consent">) {
  const supabase = await createClient();
  const { consented } = await gateState(supabase);
  if (consented) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-lg space-y-6 p-6">
      <h1>Before you start</h1>
      <p className="text-sm opacity-80">
        This app records you while you exercise. Under Thailand&apos;s PDPA we need your explicit
        agreement to each of the three things below. All three are needed to use the app.
      </p>
      {typeof error === "string" && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <form className="space-y-4">
        {CONSENT_KINDS.map(({ kind, title, text }) => (
          <label key={kind} className="flex gap-3 rounded-xl border p-4 has-checked:border-foreground/60">
            <input type="checkbox" name={kind} required className="mt-0.5 size-5 shrink-0" />
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="mt-1 block text-sm opacity-80">{text}</span>
            </span>
          </label>
        ))}
        <p className="text-xs opacity-70">Consent version {CONSENT_VERSION}. Your agreement is recorded with the time.</p>
        <p className="text-sm">Tick all three boxes, then press Continue.</p>
        <div className="flex flex-wrap gap-3">
          <TickAll />
          <SubmitButton formAction={grantConsents} className="btn">
            Continue
          </SubmitButton>
          <SubmitButton formAction={signOut} formNoValidate className="btn-quiet">
            Decline and sign out
          </SubmitButton>
        </div>
      </form>
    </main>
  );
}
