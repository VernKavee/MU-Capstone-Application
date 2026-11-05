// The app's few icons, drawn inline so nothing is fetched: 24 px grid, round strokes, the
// colour from the text around them. Decorative: the button or link beside each carries the name.
import type { ReactNode } from "react";

function Icon({ className = "size-5", children }: { className?: string; children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

type P = { className?: string };
export const ChevronLeft = (p: P) => <Icon {...p}><path d="M15 5l-7 7 7 7" /></Icon>;
export const ChevronRight = (p: P) => <Icon {...p}><path d="M9 5l7 7-7 7" /></Icon>;
export const Minus = (p: P) => <Icon {...p}><path d="M6 12h12" /></Icon>;
export const Plus = (p: P) => <Icon {...p}><path d="M6 12h12M12 6v12" /></Icon>;
export const Close = (p: P) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Speaker = (p: P) => <Icon {...p}><path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" /></Icon>;
export const SpeakerOff = (p: P) => <Icon {...p}><path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6" /></Icon>;
export const Warning = (p: P) => <Icon {...p}><path d="M12 4l9 16H3zM12 10v4M12 17v.5" /></Icon>;
export const Spark = (p: P) => <Icon {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" /></Icon>;
export const Home = (p: P) => <Icon {...p}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" /></Icon>;
export const Chart = (p: P) => <Icon {...p}><path d="M5 20v-8M12 20V5M19 20v-9M3 20h18" /></Icon>;
export const Gear = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </Icon>
);
export const Figure = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="4.5" r="1.8" fill="currentColor" />
    <path d="M12 7.5v5.5M8 10l4-1 4 1M12 13l-3 3 1 5M12 13l3 3-1 5" />
  </Icon>
);
