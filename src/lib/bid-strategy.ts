import { estimateBuyerCosts } from "@/src/lib/costs";
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

const LABELS: Record<BidScenarioKey, string> = {
  cautious: "Voorzichtig",
  balanced: "Gebalanceerd",
  strong: "Sterk",
};

function roundToStep(value: number, step = 500) {
  return Math.round(value / step) * step;
}

function clampToBudget(amount: number, budget?: number) {
  if (!budget || budget < 1) return amount;
  return Math.min(amount, budget);
}

export function attentionSignals(analysis?: Analysis | null) {
  return (analysis?.signals ?? []).filter((signal) => signal.severity === "attention");
}

export function buildBidStrategy(askingPrice: number, analysis?: Analysis | null, profile?: Pick<BuyerProfile, "budget" | "firstTimeBuyer" | "ownFunds"> | null): BidStrategy | null {
  if (!askingPrice || askingPrice < 1) return null;
  const attention = attentionSignals(analysis);
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
    if (overBudget) reasons.push(`Afgetopt op je maximum van ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(budget!)}.`);
    if (!inspectionCondition) reasons.push("Zonder keuringsvoorbehoud draag je bouwkundig risico zelf.");
    if (!financingCondition) reasons.push("Zonder financieringsvoorbehoud kun je de boete van 10% riskeren als de bank niet meegaat.");
    return { key, label: LABELS[key], amount, financingCondition, inspectionCondition, reasons, overBudget };
  }

  const cautious = scenario("cautious", 1 - Math.max(0.02, riskDiscount + 0.01), true, true, [
    "Lager dan de vraagprijs omdat er nog onzekerheid is.",
    "Financierings- en keuringsvoorbehoud blijven aan.",
  ]);
  const balanced = scenario("balanced", 1 - riskDiscount, true, true, [
    riskDiscount > 0 ? "Vraagprijs gecorrigeerd voor aandachtspunten uit de woningcheck." : "Rond de vraagprijs, met beide ontbindende voorwaarden.",
    firstTime ? "Als starter is een keuringsvoorbehoud extra verstandig." : "Voorbehouden houden de koop omkeerbaar tot de deadlines.",
  ]);
  const strong = scenario(
    "strong",
    1 + (attention.length === 0 ? 0.01 : 0),
    !firstTime && attention.length === 0,
    attention.length === 0 && !foundationRisk,
    attention.length === 0
      ? ["Alleen een klein surplus als de open data weinig rode vlaggen toont.", "Dit is geen winkansvoorspelling: biedconcurrentie kennen we niet."]
      : ["Geen opslag boven de vraag zolang er aandachtspunten openstaan."],
  );

  const recommended: BidScenarioKey = foundationRisk || attention.length >= 3 ? "cautious" : attention.length > 0 || firstTime ? "balanced" : "strong";
  const costs = profile ? estimateBuyerCosts(askingPrice, profile) : null;
  const riskSummary = attention.length
    ? `${attention.length} aandachtspunt${attention.length === 1 ? "" : "en"} uit de open-data check${foundationRisk ? ", waaronder fundering" : ""}.`
    : "Geen zware open-data aandachtspunten; bouwkundige staat blijft onbekend zonder keuring.";

  return {
    askingPrice,
    recommended,
    scenarios: { cautious, balanced, strong },
    valuationNote: costs
      ? `Geen taxatie. Vraagprijs is wat de verkoper vraagt, niet wat de woning waard is. Indicatieve kosten koper circa ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(costs.total)}.`
      : "Geen taxatie en geen Kadaster-referenties. Vul de vraagprijs in; een marktwaarde volgt pas met officiële comparables of een taxateur.",
    riskSummary,
  };
}
