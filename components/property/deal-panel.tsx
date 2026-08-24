import { useTranslations } from "next-intl";
import { Link } from "@/src/lib/i18n/navigation";
import type { Route } from "next";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { computePropertyAffordability, fitLabel } from "@/src/lib/affordability";
import { listingMatchesBuyerProfile } from "@/src/lib/listing-profile-match";
import { formatEuro, type BuyerProfile } from "@/src/lib/purchase";
import type { CalculatorState } from "@/src/lib/mortgage/calculator-state";
import type { PropertyListing } from "@/src/lib/types";

export function PropertyDealPanel({
  listing,
  buyerProfile,
  mortgageState,
  mortgageConfigured,
  hypotheekHref,
  energyLabel,
  personalFit,
}: {
  listing: PropertyListing | null;
  buyerProfile: BuyerProfile;
  mortgageState: CalculatorState | null;
  mortgageConfigured: boolean;
  hypotheekHref: Route;
  energyLabel?: string;
  personalFit: number | null;
}) {
  const t = useTranslations("woning");
  const askingPrice = listing?.askingPrice ?? 0;
  const affordability = mortgageConfigured
    ? computePropertyAffordability({
      state: mortgageState,
      askingPrice,
      energyLabel,
      nhg: mortgageState?.nhg ?? buyerProfile.nhg,
    })
    : null;
  const loan = affordability?.available ? affordability.maxLoanForPurchase : undefined;
  const costs = askingPrice > 0
    ? estimateBuyerCosts(askingPrice, {
      ...buyerProfile,
      nhg: mortgageState?.nhg ?? buyerProfile.nhg,
    }, loan)
    : null;
  const chips = listingMatchesBuyerProfile(listing, buyerProfile);
  const ownFunds = affordability?.ownFunds ?? buyerProfile.ownFunds;
  const ownNeeded = costs?.ownFundsNeeded ?? null;
  const gap = ownNeeded != null ? ownNeeded - ownFunds : affordability?.ownFundsGap;
  const maxBar = Math.max(askingPrice, costs?.total ?? 0, ownNeeded ?? 0, 1);
  const fit = affordability?.available ? affordability.fit : "unknown";

  return (
    <section className="dash-deal" id="deal">
      <div className="dash-deal-head">
        <div>
          <div className="section-kicker">{t("deal.kicker")}</div>
          <h2>{t("deal.heading")}</h2>
        </div>
        <span className={`fit-badge fit-${fit}`}>{fitLabel(fit)}</span>
      </div>
      <div className="dash-deal-stats">
        <div>
          <small>{t("deal.maxMortgage")}</small>
          <strong>{affordability?.available ? formatEuro(affordability.maxLoanForPurchase) : "—"}</strong>
        </div>
        <div>
          <small>{t("deal.maxAfterCosts")}</small>
          <strong>{affordability?.available ? formatEuro(affordability.maxPurchasePriceAfterCosts) : "—"}</strong>
        </div>
        <div>
          <small>{t("deal.monthlyPayment")}</small>
          <strong>{affordability?.available ? formatEuro(affordability.monthlyPayment) : "—"}</strong>
        </div>
        <div className={gap == null ? undefined : gap > 0 ? "is-short" : "is-ok"}>
          <small>{t("deal.ownFunds")}</small>
          <strong>{ownNeeded != null ? formatEuro(ownNeeded) : "—"}</strong>
          <span>
            {gap == null
              ? t("deal.enterOwnFunds")
              : gap > 0
                ? t("deal.shortfall", { amount: formatEuro(gap) })
                : t("deal.buffer", { amount: formatEuro(Math.abs(gap)) })}
          </span>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="dash-wish-chips" aria-label={t("deal.wishesAria")}>
          {chips.map((chip) => (
            <span className={`wish-chip is-${chip.status}`} key={chip.key} title={chip.detail}>
              {chip.label}
            </span>
          ))}
          {personalFit != null && (
            <span className="wish-chip is-pass">{t("deal.fitChip", { score: personalFit.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) })}</span>
          )}
          {affordability?.available && buyerProfile.monthlyPayment > 0 && (
            <span className={`wish-chip is-${affordability.monthlyPayment <= buyerProfile.monthlyPayment ? "pass" : "fail"}`}>
              {t("deal.monthChip", { amount: formatEuro(affordability.monthlyPayment) })}
            </span>
          )}
        </div>
      )}
      {costs ? (
        <div className="dash-waterfall">
          <div className="dash-waterfall-row">
            <span>{t("deal.purchasePrice")}</span>
            <i style={{ width: `${Math.round((askingPrice / maxBar) * 100)}%` }} />
            <strong>{formatEuro(askingPrice)}</strong>
          </div>
          {costs.lines.filter((line) => line.amount > 0).map((line) => (
            <div className="dash-waterfall-row is-cost" key={line.key}>
              <span>{line.label}</span>
              <i style={{ width: `${Math.max(4, Math.round((line.amount / maxBar) * 100))}%` }} />
              <strong>{formatEuro(line.amount)}</strong>
            </div>
          ))}
          <div className="dash-waterfall-row is-total">
            <span>{t("deal.totalAllIn")}</span>
            <strong>{formatEuro(askingPrice + costs.total)}</strong>
          </div>
          {affordability?.available && affordability.energyMeasureExtra > 0 && (
            <div className="dash-waterfall-row is-cost">
              <span>{t("deal.sustainabilityExtra")}</span>
              <i style={{ width: `${Math.max(4, Math.round((affordability.energyMeasureExtra / maxBar) * 100))}%` }} />
              <strong>{formatEuro(affordability.energyMeasureExtra)}</strong>
            </div>
          )}
        </div>
      ) : (
        <p className="dash-deal-empty">{t("deal.connectListing")}</p>
      )}
      {!mortgageConfigured && (
        <Link className="primary-button" href={hypotheekHref}>{t("deal.fillIncome")}</Link>
      )}
      {mortgageConfigured && (
        <Link className="text-link" href={hypotheekHref}>{t("deal.adjustMortgage")}</Link>
      )}
    </section>
  );
}
