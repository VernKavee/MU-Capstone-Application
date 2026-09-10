import { redirect } from "next/navigation";
import { signOut } from "../(auth)/actions";
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
    <main className="mx-auto w-full max-w-lg p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Before you start</h1>
      <p className="text-sm">
        This app records you while you exercise. Under Thailand&apos;s PDPA we need your explicit
        agreement to each of the three things below. All three are needed to use the app.
      </p>
      {typeof error === "string" && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>
      )}
      <form className="space-y-4">
        {CONSENT_KINDS.map(({ kind, title, text }) => (
          <label key={kind} className="flex gap-3 rounded border p-3">
            <input type="checkbox" name={kind} required className="mt-1" />
            <span>
              <span className="block font-medium">{title}</span>
              <span className="block text-sm opacity-80">{text}</span>
            </span>
          </label>
        ))}
        <p className="text-xs opacity-70">Consent version {CONSENT_VERSION}. Your agreement is recorded with the time.</p>
        <p className="text-sm">Tick all three boxes, then press Continue.</p>
        <div className="flex flex-wrap gap-3">
          <TickAll />
          <button formAction={grantConsents} className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
            Continue
          </button>
          <button formAction={signOut} formNoValidate className="rounded border px-4 py-2">
            Decline and sign out
          </button>
        </div>
      </form>
    </main>
  );
}
