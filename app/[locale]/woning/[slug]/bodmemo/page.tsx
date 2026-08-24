import { ArrowLeft } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/src/lib/i18n/navigation";
import { notFound } from "next/navigation";
import type { Route } from "next";
import { PrintButton } from "@/components/print-button";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import { buildBidStrategy, type BidScenarioKey } from "@/src/lib/bid-strategy";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { buildOfferMemo, offerMemoFilename } from "@/src/lib/offer-memo";

const SCENARIOS: BidScenarioKey[] = ["cautious", "balanced", "strong"];

export default async function OfferMemoPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ price?: string; scenario?: string; financing?: string; inspection?: string }>;
}) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  const t = await getTranslations("woning");
  if (!isValidBagId(decodeURIComponent(slug))) notFound();
  let error = "";
  let memoContent: Awaited<ReturnType<typeof buildMemo>> | null = null;
  try {
    memoContent = await buildMemo(slug, query, t);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : t("bodmemo.creationFailed");
  }

  if (error || !memoContent) {
    return (
      <main className="site-shell offer-memo-shell">
        <div className="container">
          <Link className="back-link" href={`/woning/${slug}` as Route}>
            <ArrowLeft size={14} /> {t("bodmemo.backToCheck")}
          </Link>
          <h1>{t("bodmemo.errorTitle")}</h1>
          <p className="hero-copy" role="alert">{error || t("bodmemo.insufficientData")}</p>
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
            <ArrowLeft size={14} /> {t("bodmemo.backToCheck")}
          </Link>
          <PrintButton />
        </div>
        <article className="offer-memo" aria-label={t("bodmemo.memoAria")}>
          <header className="offer-memo-head">
            <small>{memo.generatedAtLabel}</small>
            <h1>{memo.title}</h1>
            <p>{memo.subtitle}</p>
          </header>
          <section className="offer-memo-bid" aria-label={t("bodmemo.bidAmountAria")}>
            <span>{t("bodmemo.myOffer")}</span>
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
            <legend>{t("bodmemo.printVariantLegend")}</legend>
            <label>
              {t("bodmemo.askingPriceEur")}
              <input type="number" name="price" min={0} step={500} defaultValue={query.price ?? ""} inputMode="numeric" />
            </label>
            <label>
              {t("bodmemo.scenario")}
              <select name="scenario" defaultValue={query.scenario ?? "balanced"}>
                <option value="cautious">{t("bodmemo.cautious")}</option>
                <option value="balanced">{t("bodmemo.balanced")}</option>
                <option value="strong">{t("bodmemo.strong")}</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="financing" value="uit" defaultChecked={query.financing === "uit"} />
              {t("bodmemo.withoutFinancing")}
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="inspection" value="uit" defaultChecked={query.inspection === "uit"} />
              {t("bodmemo.withoutInspection")}
            </label>
            <button className="secondary-button" type="submit">{t("bodmemo.refreshMemo")}</button>
          </fieldset>
          <small>{t("bodmemo.filenamePrefix")} <code>{filename}.pdf</code></small>
        </form>
      </div>
    </main>
  );
}

async function buildMemo(
  slug: string,
  query: { price?: string; scenario?: string; financing?: string; inspection?: string },
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  const property = await getPropertyById(decodeURIComponent(slug));
  const analysis = await getSharedAnalysis(property);
  const askingPrice = Number(query.price) > 0 ? Number(query.price) : null;
  if (!askingPrice) throw new Error(t("bodmemo.missingAskingPrice"));

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
    scenarioLabel: scenario?.label ?? t("bodmemo.balancedLabel"),
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
