import { SiteHeader } from "@/components/site-header";
import { MortgageCalculator, MortgagePageIntro } from "@/components/mortgage-calculator";
import { parseCanonicalEnergyLabel } from "@/src/lib/mortgage";

export const metadata = {
  title: "Hypotheek berekenen — WoonReality",
  description: "Bereken je maximale hypotheek, kosten koper, hypotheekrenteaftrek en vergelijk annuïteit vs lineair. Live DNB/ECB-rente en leennormen 2026.",
};

export default async function HypotheekPage({ searchParams }: { searchParams: Promise<{ label?: string; price?: string; nhg?: string }> }) {
  const params = await searchParams;
  const price = params.price ? Number(params.price) : 0;
  return <main className="site-shell">
    <div className="container"><SiteHeader current="hypotheek" /></div>
    <div className="container mortgage-page">
      <MortgagePageIntro />
      <MortgageCalculator
        initialEnergyLabel={parseCanonicalEnergyLabel(params.label)}
        initialAskingPrice={Number.isFinite(price) ? price : 0}
        initialNhg={params.nhg === "1" ? true : params.nhg === "0" ? false : undefined}
      />
    </div>
  </main>;
}
