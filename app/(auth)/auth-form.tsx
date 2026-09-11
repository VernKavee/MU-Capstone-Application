import Link from "next/link";
import { SubmitButton } from "../submit-button";

type Props = {
  title: string;
  submitLabel: string;
  pendingLabel: string;
  action: (formData: FormData) => Promise<void>;
  error?: string;
  footer: React.ReactNode;
};

export function AuthForm({ title, submitLabel, pendingLabel, action, error, footer }: Props) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-10">
        {/* The name in the counter's face: the first screen anyone sees. */}
        <div className="space-y-3">
          <p className="font-display text-7xl leading-[0.85]">Posture Coach</p>
          <p className="opacity-70">Checks your form and counts your correct reps as you move, for Squat, Push-up, Lunge, and Bicep curl.</p>
        </div>
        <form action={action} className="space-y-4">
          <h1 className="text-3xl">{title}</h1>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <label className="block text-sm">
            Email
            <input name="email" type="email" required autoComplete="email" className="field" />
          </label>
          <label className="block text-sm">
            Password
            <input name="password" type="password" required minLength={8} autoComplete="current-password" className="field" />
          </label>
          <SubmitButton pendingText={pendingLabel} className="btn w-full">
            {submitLabel}
          </SubmitButton>
          <p className="text-sm">{footer}</p>
        </form>
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: "/login" | "/register"; children: React.ReactNode }) {
  return <Link href={href} className="underline">{children}</Link>;
}
