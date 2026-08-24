import { estimateBuyerCosts } from "@/src/lib/costs";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type { BuyerProfile } from "@/src/lib/purchase";
import type { Analysis } from "@/src/lib/types";

export type BidScenarioKey = "cautious" | "balanced" | "strong";

export type BidScenario = {
  key: BidScenarioKey;
  label: string;
  amount: number;
  financingCondition: boolean;
  inspectionCondition: boolean;
  reasons: string[];
  overBudget: boolean;
};

export type BidStrategy = {
  askingPrice: number;
  recommended: BidScenarioKey;
  scenarios: Record<BidScenarioKey, BidScenario>;
  valuationNote: string;
  riskSummary: string;
};

export type NegotiationGuidance = {
  counterOfferSteps: string[];
  escalationClause: { title: string; summary: string; whenToUse: string; caution: string };
  walkAwayReminder: string;
};

function roundToStep(value: number, step = 500) {
  return Math.round(value / step) * step;
}

function clampToBudget(amount: number, budget?: number) {
  if (!budget || budget < 1) return amount;
  return Math.min(amount, budget);
}

function euroFormatter(locale: Locale) {
  return new Intl.NumberFormat(locale === "en" ? "en-IE" : "nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export function attentionSignals(analysis?: Analysis | null) {
  return (analysis?.signals ?? []).filter((signal) => signal.severity === "attention");
}

/**
 * A tegenbod is normal, not a sign you should panic-raise your bid. This is
 * exactly the coaching an aankoopmakelaar gives during onderhandeling: react
 * on one variable at a time, and know the ophoogclausule option and your
 * walk-away price before you're in the moment.
 */
export function negotiationGuidance(strategy: BidStrategy | null, selected: BidScenarioKey, budget?: number, locale: Locale = "nl"): NegotiationGuidance {
  const t = getLibTranslator(locale, "lib-finance");
  const scenario = strategy?.scenarios[selected];
  const maxAmount = budget && budget > 0 ? budget : scenario?.amount;
  return {
    counterOfferSteps: [
      t("bidStrategy.negotiation.step1"),
      t("bidStrategy.negotiation.step2"),
      t("bidStrategy.negotiation.step3"),
      t("bidStrategy.negotiation.step4"),
    ],
    escalationClause: {
      title: t("bidStrategy.negotiation.escalationTitle"),
      summary: t("bidStrategy.negotiation.escalationSummary"),
      whenToUse: t("bidStrategy.negotiation.escalationWhenToUse"),
      caution: t("bidStrategy.negotiation.escalationCaution"),
    },
    walkAwayReminder: maxAmount
      ? t("bidStrategy.negotiation.walkAwayWithMax", { max: euroFormatter(locale).format(maxAmount) })
      : t("bidStrategy.negotiation.walkAwayWithoutMax"),
  };
}

export function buildBidStrategy(askingPrice: number, analysis?: Analysis | null, profile?: Pick<BuyerProfile, "budget" | "firstTimeBuyer" | "ownFunds"> | null, locale: Locale = "nl"): BidStrategy | null {
  if (!askingPrice || askingPrice < 1) return null;
  const t = getLibTranslator(locale, "lib-finance");
  const euro = euroFormatter(locale);
  const analysisAvailable = analysis != null;
  const attention = analysisAvailable ? attentionSignals(analysis) : [];
  const foundationRisk = attention.some((signal) => signal.key === "foundation" || /funder/i.test(signal.label) || /funder/i.test(signal.summary));
  const energyRisk = attention.some((signal) => signal.key === "energy");
  const riskDiscount = Math.min(0.06, attention.length * 0.005 + (foundationRisk ? 0.015 : 0) + (energyRisk ? 0.005 : 0));
  const budget = profile?.budget && profile.budget > 0 ? profile.budget : undefined;
  const firstTime = Boolean(profile?.firstTimeBuyer);

  function scenario(key: BidScenarioKey, factor: number, financingCondition: boolean, inspectionCondition: boolean, extraReasons: string[]): BidScenario {
    const raw = roundToStep(askingPrice * factor);
    const amount = clampToBudget(raw, budget);
    const overBudget = Boolean(budget && raw > budget);
    const reasons = [...extraReasons];
    if (overBudget) reasons.push(t("bidStrategy.reasons.cappedAtBudget", { amount: euro.format(budget!) }));
    if (!inspectionCondition) reasons.push(t("bidStrategy.reasons.noInspectionRisk"));
    if (!financingCondition) reasons.push(t("bidStrategy.reasons.noFinancingPenalty"));
    if (amount > askingPrice) {
      reasons.push(t("bidStrategy.reasons.aboveAskingPrice"));
    }
    return { key, label: t(`bidStrategy.labels.${key}`), amount, financingCondition, inspectionCondition, reasons, overBudget };
  }

  const cautious = scenario("cautious", 1 - Math.max(0.02, riskDiscount + 0.01), true, true, [
    t("bidStrategy.cautiousReason1"),
    t("bidStrategy.cautiousReason2"),
  ]);
  const balanced = scenario("balanced", 1 - riskDiscount, true, true, [
    riskDiscount > 0 ? t("bidStrategy.balancedAdjusted") : t("bidStrategy.balancedAtAskingPrice"),
    firstTime ? t("bidStrategy.balancedStarterSurvey") : t("bidStrategy.balancedConditionsHold"),
  ]);
  // Financieringsvoorbehoud laten we nooit vervallen voor starters: zij hebben
  // doorgaans geen overwaarde of buffer om een afgewezen aanvraag op te vangen.
  const strong = analysisAvailable
    ? scenario(
      "strong",
      1 + (attention.length === 0 ? 0.01 : 0),
      firstTime ? true : attention.length === 0,
      attention.length === 0 && !foundationRisk,
      attention.length === 0
        ? [t("bidStrategy.strongCleanReason1"), t("bidStrategy.strongCleanReason2")]
        : [t("bidStrategy.strongIssuesReason")],
    )
    : scenario("strong", 1, true, true, [
      t("bidStrategy.strongNoAnalysisReason1"),
      t("bidStrategy.strongNoAnalysisReason2"),
    ]);

  const recommended: BidScenarioKey = !analysisAvailable
    ? "balanced"
    : foundationRisk || attention.length >= 3 ? "cautious" : attention.length > 0 || firstTime ? "balanced" : "strong";
  const costs = profile ? estimateBuyerCosts(askingPrice, profile, undefined, undefined, locale) : null;
  const foundationSuffix = foundationRisk ? t("bidStrategy.riskSummary.foundationSuffix") : "";
  const riskSummary = attention.length
    ? t(attention.length === 1 ? "bidStrategy.riskSummary.one" : "bidStrategy.riskSummary.many", { count: attention.length, suffix: foundationSuffix })
    : t("bidStrategy.riskSummary.none");

  return {
    askingPrice,
    recommended,
    scenarios: { cautious, balanced, strong },
    valuationNote: costs
      ? t("bidStrategy.valuationNoteWithCosts", { costs: euro.format(costs.total) })
      : t("bidStrategy.valuationNoteWithoutCosts"),
    riskSummary,
  };
}
