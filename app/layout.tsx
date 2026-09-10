import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Posture Coach",
  description: "Live form checking and rep counting for Squat, Push-up, Lunge, and Bicep curl",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
