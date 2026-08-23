import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { PrintButton } from "@/components/print-button";
import { analyzeProperty } from "@/src/lib/analysis/analyze";
import { buildBidStrategy, type BidScenarioKey } from "@/src/lib/bid-strategy";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { buildOfferMemo, offerMemoFilename } from "@/src/lib/offer-memo";

const SCENARIOS: BidScenarioKey[] = ["cautious", "balanced", "strong"];

export default async function OfferMemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ price?: string; scenario?: string; financing?: string; inspection?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  let error = "";
  let memoContent: Awaited<ReturnType<typeof buildMemo>> | null = null;
  try {
    memoContent = await buildMemo(slug, query);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "De bodmemo kon niet worden gemaakt.";
  }

  if (error || !memoContent) {
    return (
      <main className="site-shell offer-memo-shell">
        <div className="container">
          <Link className="back-link" href={`/woning/${slug}` as Route}>
            <ArrowLeft size={14} /> Terug naar de woningcheck
          </Link>
          <h1>Bodmemo lukt nu niet</h1>
          <p className="hero-copy" role="alert">{error || "Onvoldoende data voor een bodmemo."}</p>
        </div>
      </main>
    );
  }

  const { memo, filename } = memoContent;
  return (
    <main className="site-shell offer-memo-shell">
      <div className="container">
        <div className="offer-memo-toolbar no-print">
          <Link className="back-link" href={`/woning/${slug}` as Route}>
            <ArrowLeft size={14} /> Terug naar de woningcheck
          </Link>
          <PrintButton />
        </div>
        <article className="offer-memo" aria-label="Bodmemo">
          <header className="offer-memo-head">
            <small>{memo.generatedAtLabel}</small>
            <h1>{memo.title}</h1>
            <p>{memo.subtitle}</p>
          </header>
          <section className="offer-memo-bid" aria-label="Bodbedrag">
            <span>Mijn bod</span>
            <strong>{memo.bidAmountLabel}</strong>
          </section>
          {memo.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <ul>
                {section.lines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
          <footer className="offer-memo-footer">{memo.disclaimer}</footer>
        </article>
        <form action={`/woning/${slug}/bodmemo`} method="get" className="offer-memo-tuning no-print">
          <fieldset>
            <legend>Andere variant printen</legend>
            <label>
              Vraagprijs (€)
              <input type="number" name="price" min={0} step={500} defaultValue={query.price ?? ""} inputMode="numeric" />
            </label>
            <label>
              Scenario
              <select name="scenario" defaultValue={query.scenario ?? "balanced"}>
                <option value="cautious">Voorzichtig</option>
                <option value="balanced">Gebalanceerd</option>
                <option value="strong">Sterk</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="financing" value="uit" defaultChecked={query.financing === "uit"} />
              Zonder financieringsvoorbehoud
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="inspection" value="uit" defaultChecked={query.inspection === "uit"} />
              Zonder keuringsvoorbehoud
            </label>
            <button className="secondary-button" type="submit">Bodmemo verversen</button>
          </fieldset>
          <small>Bestandsnaam bij opslaan als PDF: <code>{filename}.pdf</code></small>
        </form>
      </div>
    </main>
  );
}

async function buildMemo(slug: string, query: { price?: string; scenario?: string; financing?: string; inspection?: string }) {
  const property = await getPropertyById(decodeURIComponent(slug));
  const analysis = await analyzeProperty(property);
  const askingPrice = Number(query.price) > 0 ? Number(query.price) : null;
  if (!askingPrice) throw new Error("Voeg eerst een vraagprijs toe via het bodconcept in de woningcheck.");

  const scenarioKey: BidScenarioKey = SCENARIOS.includes(query.scenario as BidScenarioKey)
    ? (query.scenario as BidScenarioKey)
    : "balanced";
  const strategy = buildBidStrategy(askingPrice, analysis);
  const scenario = strategy?.scenarios[scenarioKey];
  const bidAmount = scenario?.amount ?? askingPrice;
  const financingCondition = query.financing !== "uit";
  const inspectionCondition = query.inspection !== "uit";
  const costs = estimateBuyerCosts(bidAmount, { firstTimeBuyer: false, selfOccupied: true, budget: 0, ownFunds: 0 });

  const memo = buildOfferMemo({
    addressLabel: `${property.street} ${property.houseNumber}${property.houseLetter ?? ""}${property.addition ?? ""}`,
    postcodeCity: `${property.postcode} ${property.city}`,
    generatedAt: new Date().toISOString(),
    scenarioKey,
    scenarioLabel: scenario?.label ?? "Gebalanceerd",
    bidAmount,
    askingPrice,
    financingCondition,
    inspectionCondition,
    costsTotal: costs?.total,
    ownFundsNeeded: costs?.ownFundsNeeded,
    overallScore: analysis.overallScore,
    attentionPoints: analysis.highlights.filter((highlight) => highlight.type === "attention").map((highlight) => highlight.text),
  });
  return { memo, filename: offerMemoFilename(memo.subtitle.split(" — ")[0]) };
}
