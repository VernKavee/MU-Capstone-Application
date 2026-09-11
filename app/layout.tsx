import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// One display weight for page titles and the big numbers; everything else is system UI.
const display = localFont({ src: "./fonts/big-shoulders-display-800.woff2", weight: "800", variable: "--font-big-shoulders" });

export const metadata: Metadata = {
  title: "Posture Coach",
  description: "Live form checking and rep counting for Squat, Push-up, Lunge, and Bicep curl",
};

// The one theme is dark: native controls and the phone's browser bar match it before the CSS loads.
export const viewport: Viewport = { colorScheme: "dark", themeColor: "#1b1a16" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
