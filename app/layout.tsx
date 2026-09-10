import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// One display weight for the live counter and countdown; everything else is system UI.
const display = localFont({ src: "./fonts/big-shoulders-display-800.woff2", weight: "800", variable: "--font-big-shoulders" });

export const metadata: Metadata = {
  title: "Posture Coach",
  description: "Live form checking and rep counting for Squat, Push-up, Lunge, and Bicep curl",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
