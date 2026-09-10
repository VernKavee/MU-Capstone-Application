import Link from "next/link";

type Props = {
  title: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<void>;
  error?: string;
  footer: React.ReactNode;
};

export function AuthForm({ title, submitLabel, action, error, footer }: Props) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={action} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {error && (
          <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
            {error}
          </p>
        )}
        <label className="block text-sm">
          Email
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="block text-sm">
          Password
          <input name="password" type="password" required minLength={8} autoComplete="current-password" className="mt-1 w-full rounded border p-2" />
        </label>
        <button type="submit" className="w-full rounded bg-black p-2 text-white dark:bg-white dark:text-black">
          {submitLabel}
        </button>
        <p className="text-sm">{footer}</p>
      </form>
    </main>
  );
}

export function AuthLink({ href, children }: { href: "/login" | "/register"; children: React.ReactNode }) {
  return <Link href={href} className="underline">{children}</Link>;
}
