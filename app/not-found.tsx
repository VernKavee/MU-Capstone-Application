import Link from "next/link";

// Every notFound() and every address that matches no page: a mistyped link, an exercise
// that is not in the catalogue, or a workout or set of another account. Row-level
// security returns nothing for those, so they read as missing, never as forbidden.
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p>Nothing is at this address. Check the link, or start again from Home.</p>
      <Link href="/" className="self-start rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
        Home
      </Link>
    </main>
  );
}
