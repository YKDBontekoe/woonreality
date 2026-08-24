import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { MortgageCalculator, MortgagePageIntro } from "@/components/mortgage-calculator";
import { parseCanonicalEnergyLabel } from "@/src/lib/mortgage";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ label?: string; price?: string; nhg?: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hypotheek" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function HypotheekPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const price = query.price ? Number(query.price) : 0;
  return <main className="site-shell mortgage-shell">
    <div className="container"><SiteHeader current="hypotheek" /></div>
    <div className="container mortgage-page">
      <MortgagePageIntro />
      <MortgageCalculator
        initialEnergyLabel={parseCanonicalEnergyLabel(query.label)}
        initialAskingPrice={Number.isFinite(price) ? price : 0}
        initialNhg={query.nhg === "1" ? true : query.nhg === "0" ? false : undefined}
      />
    </div>
  </main>;
}
