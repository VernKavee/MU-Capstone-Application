// Shown the moment a link inside the app is pressed, until the page's data arrives. A
// navigation shows only the loading file of the folder whose child segment it changes,
// never one further up (Phase 6: with this file alone, History to one exercise kept the
// old page up until the new one was ready). So the folders whose pages link to each other
// re-export it: history/, history/[exercise]/, history/[exercise]/[workout]/, and
// workout/[exercise]/.
export default function Loading() {
  return (
    <main aria-busy="true" className="space-y-6 p-6">
      <div aria-hidden className="h-8 w-2/3 rounded bg-foreground/10 motion-safe:animate-pulse" />
      <p role="status" className="text-sm opacity-60">
        Loading
      </p>
      <div aria-hidden className="h-48 rounded-2xl bg-foreground/5 motion-safe:animate-pulse" />
    </main>
  );
}
