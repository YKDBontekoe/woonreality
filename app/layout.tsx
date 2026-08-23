import type { Metadata, Viewport } from "next";
import "./globals.css";

const description = "Koop een huis zonder makelaar ernaast: open-data woningcheck, documenten, bezichtiging en een bodconcept dat jij zelf verstuurt.";

export const metadata: Metadata = {
  title: {
    default: "WoonReality — AI-aankoopbegeleider",
    template: "%s — WoonReality",
  },
  description,
  openGraph: {
    title: "WoonReality — AI-aankoopbegeleider",
    description,
    siteName: "WoonReality",
    locale: "nl_NL",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "WoonReality — AI-aankoopbegeleider",
    description,
  },
};

export const viewport: Viewport = {
  themeColor: "#fbfbfd",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
