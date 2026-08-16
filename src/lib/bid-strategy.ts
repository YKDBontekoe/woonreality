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

export type NegotiationGuidance = {
  counterOfferSteps: string[];
  escalationClause: { title: string; summary: string; whenToUse: string; caution: string };
  walkAwayReminder: string;
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

/**
 * A tegenbod is normal, not a sign you should panic-raise your bid. This is
 * exactly the coaching an aankoopmakelaar gives during onderhandeling: react
 * on one variable at a time, and know the ophoogclausule option and your
 * walk-away price before you're in the moment.
 */
export function negotiationGuidance(strategy: BidStrategy | null, selected: BidScenarioKey, budget?: number): NegotiationGuidance {
  const scenario = strategy?.scenarios[selected];
  const maxAmount = budget && budget > 0 ? budget : scenario?.amount;
  return {
    counterOfferSteps: [
      "Reageer op één variabele tegelijk: óf het bedrag, óf een voorwaarde (bv. een voorbehoud laten vallen). Niet allebei in dezelfde stap weggeven.",
      "Vraag altijd wat de reden van het tegenbod is: een ander bod, een taxatieverschil, of gewoon onderhandelruimte. Dat bepaalt je reactie.",
      "Verhoog in kleine, beargumenteerde stappen. Elke verhoging zonder toelichting wekt de indruk dat er nog meer ruimte is.",
      "Zet nieuwe afspraken altijd schriftelijk (e-mail) vast, ook als de makelaar van de verkoper mondeling akkoord lijkt.",
    ],
    escalationClause: {
      title: "Ophoogclausule (escalation clause)",
      summary: "Een ophoogclausule zegt: 'ik bied X, maar ga automatisch Y hoger dan het beste concurrerende bod, tot een maximum van Z.' Dit voorkomt dat je blind moet gokken tegen onbekende concurrentie.",
      whenToUse: "Vooral zinvol bij aantoonbare biedconcurrentie (meerdere kijkers, korte reactietermijn) en als je een keiharde bovengrens hebt.",
      caution: "De verkoper moet bewijs van het concurrerende bod kunnen tonen; leg dat vooraf vast. Niet elke verkopend makelaar accepteert deze clausule.",
    },
    walkAwayReminder: maxAmount
      ? `Bepaal vooraf je maximum (nu circa ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(maxAmount)}) en wees bereid om af te haken zodra dat wordt overschreden. Een huis waarvoor je je financiële marge opgeeft, is geen goede koop.`
      : "Bepaal vooraf je maximum en wees bereid om af te haken zodra dat wordt overschreden. Een huis waarvoor je je financiële marge opgeeft, is geen goede koop.",
  };
}

export function buildBidStrategy(askingPrice: number, analysis?: Analysis | null, profile?: Pick<BuyerProfile, "budget" | "firstTimeBuyer" | "ownFunds"> | null): BidStrategy | null {
  if (!askingPrice || askingPrice < 1) return null;
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
    if (overBudget) reasons.push(`Afgetopt op je maximum van ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(budget!)}.`);
    if (!inspectionCondition) reasons.push("Zonder keuringsvoorbehoud draag je bouwkundig risico zelf.");
    if (!financingCondition) reasons.push("Zonder financieringsvoorbehoud kun je de boete van 10% riskeren als de bank niet meegaat.");
    if (amount > askingPrice) {
      reasons.push("Boven de vraagprijs: de bank leent op basis van de taxatiewaarde of de koopsom (laagste van de twee). Het verschil met de taxatiewaarde moet je uit eigen zak bijleggen.");
    }
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
  // Financieringsvoorbehoud laten we nooit vervallen voor starters: zij hebben
  // doorgaans geen overwaarde of buffer om een afgewezen aanvraag op te vangen.
  const strong = analysisAvailable
    ? scenario(
      "strong",
      1 + (attention.length === 0 ? 0.01 : 0),
      firstTime ? true : attention.length === 0,
      attention.length === 0 && !foundationRisk,
      attention.length === 0
        ? ["Alleen een klein surplus als de open data weinig rode vlaggen toont.", "Dit is geen winkansvoorspelling: biedconcurrentie kennen we niet."]
        : ["Geen opslag boven de vraag zolang er aandachtspunten openstaan."],
    )
    : scenario("strong", 1, true, true, [
      "Zonder woninganalyse blijft het bod op of onder de vraagprijs.",
      "Financierings- en keuringsvoorbehoud blijven aan tot de check er is.",
    ]);

  const recommended: BidScenarioKey = !analysisAvailable
    ? "balanced"
    : foundationRisk || attention.length >= 3 ? "cautious" : attention.length > 0 || firstTime ? "balanced" : "strong";
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
