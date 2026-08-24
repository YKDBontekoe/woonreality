import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/src/lib/i18n/routing";
import { locales, type Locale } from "@/src/lib/i18n/config";
import { WorkspaceProvider } from "@/components/workspace-provider";
import "../globals.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f13" },
  ],
  width: "device-width",
  initialScale: 1,
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  const description = t("description");
  const title = t("title");

  return {
    title: {
      default: title,
      template: `%s — WoonReality`,
    },
    description,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/icon.svg",
      apple: "/icon.svg",
    },
    openGraph: {
      title,
      description,
      siteName: "WoonReality",
      locale: locale === "en" ? "en_US" : "nl_NL",
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: `/${locale}`,
      languages: Object.fromEntries(locales.map((l) => [l === "en" ? "en" : "nl-NL", `/${l}`])),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale as Locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
