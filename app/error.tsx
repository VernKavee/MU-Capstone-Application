"use client";

import Link from "next/link";

// The error screen for anything that fails while a page renders: a query the database
// refused, a server that could not be reached. Pages throw rather than show a failure as
// an empty list (Phase 6). It sits above the (app) layout, so a failing gate lands here
// too. The reference is the digest the server logged the error under.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">This page did not load</h1>
      <p>Something went wrong on the way to the server. Check the connection, then try again.</p>
      {error.digest && <p className="text-sm opacity-70">If it keeps happening, tell the team reference {error.digest}.</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => retry()} className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          Try again
        </button>
        <Link href="/" className="text-sm underline">
          Home
        </Link>
      </div>
    </main>
  );
}
