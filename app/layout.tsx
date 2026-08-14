import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WoonReality — Weet waar je écht gaat wonen",
  description: "Een transparante reality check voor Nederlandse woonadressen.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
