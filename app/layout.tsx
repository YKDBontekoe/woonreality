import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WoonReality — AI-aankoopbegeleider",
  description: "Koop een huis zonder makelaar ernaast: open-data woningcheck, documenten, bezichtiging en een bodconcept dat jij zelf verstuurt.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
