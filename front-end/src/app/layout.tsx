import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EV Charger Map",
  description: "Find and reserve charger points around you",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="w-screen h-screen overflow-hidden">{children}</body>
    </html>
  );
}