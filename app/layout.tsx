import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Barlow Condensed for page titles and the big numbers, Barlow for everything else (2026-11-05,
// Vern, the ui-ux-pro-max sports pairing). next/font downloads both at build and serves them
// from this app, so no request leaves for Google at run time.
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-barlow-condensed" });
const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-barlow" });

export const metadata: Metadata = {
  title: "Posture Coach",
  description: "Live form checking and rep counting for Squat, Push-up, Lunge, and Bicep curl",
};

// Light pages (Daylight): native controls and the phone's browser bar match them before the CSS loads.
export const viewport: Viewport = { colorScheme: "light", themeColor: "#f9f9f8" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable} ${body.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
