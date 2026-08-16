import { calculateMortgageCapacity } from "@/src/lib/mortgage/capacity";
import { calculatorStateToFinance, type CalculatorState } from "@/src/lib/mortgage/calculator-state";
import type { MortgageCapacity, MortgageFinance } from "@/src/lib/mortgage/types";
import { formatEuro } from "@/src/lib/purchase";

export type AffordabilityFit = MortgageCapacity["fit"];

export type PropertyAffordability = {
  available: boolean;
  fit: AffordabilityFit;
  askingPrice: number;
  maxPurchasePrice: number;
  /** Koopsom die je echt kunt betalen, ná kosten koper. Gebruik dit voor budgetbeslissingen. */
  maxPurchasePriceAfterCosts: number;
  maxLoanForPurchase: number;
  monthlyPayment: number;
  buyerCosts: number | null;
  ownFunds: number;
  ownFundsGap: number | null;
  /** Positive when asking price is below max purchase price. */
  purchaseHeadroom: number | null;
  /** Positive cash left after covering own-funds need (kosten koper + cash for price). */
  renovationBuffer: number;
  energyMeasureExtra: number;
  summary: string;
};

export type AffordabilityInput = {
  finance?: MortgageFinance | null;
  state?: CalculatorState | null;
  askingPrice?: number | null;
  energyLabel?: string | null;
  nhg?: boolean;
  ownFunds?: number | null;
};

export function computePropertyAffordability(input: AffordabilityInput): PropertyAffordability {
  const finance = input.finance ?? (input.state ? calculatorStateToFinance(input.state) : null);
  const askingPrice = Math.max(0, input.askingPrice ?? 0);
  const empty: PropertyAffordability = {
    available: false,
    fit: "unknown",
    askingPrice,
    maxPurchasePrice: 0,
    maxPurchasePriceAfterCosts: 0,
    maxLoanForPurchase: 0,
    monthlyPayment: 0,
    buyerCosts: null,
    ownFunds: Math.max(0, input.ownFunds ?? 0),
    ownFundsGap: null,
    purchaseHeadroom: null,
    renovationBuffer: 0,
    energyMeasureExtra: 0,
    summary: askingPrice > 0
      ? "Vul je hypotheekcalculator in om te zien of dit huis past."
      : "Vul een vraagprijs in om te zien of dit huis past bij je koopkracht.",
  };
  if (!finance) return empty;

  const capacity = calculateMortgageCapacity(finance, {
    askingPrice: askingPrice > 0 ? askingPrice : undefined,
    energyLabel: input.energyLabel,
    nhg: input.nhg ?? (input.state?.nhg ?? false),
    ownFunds: input.ownFunds,
  });

  if (!capacity.available) {
    return {
      ...empty,
      available: false,
      summary: capacity.reason ?? empty.summary,
    };
  }

  const purchaseHeadroom = askingPrice > 0 ? Math.round(capacity.maxPurchasePriceAfterCosts - askingPrice) : null;
  const renovationBuffer = capacity.ownFundsGap != null && capacity.ownFundsGap < 0
    ? Math.round(Math.abs(capacity.ownFundsGap))
    : 0;

  return {
    available: true,
    fit: capacity.fit,
    askingPrice,
    maxPurchasePrice: capacity.maxPurchasePrice,
    maxPurchasePriceAfterCosts: capacity.maxPurchasePriceAfterCosts,
    maxLoanForPurchase: capacity.maxLoanForPurchase,
    monthlyPayment: capacity.monthlyPayment,
    buyerCosts: capacity.buyerCosts,
    ownFunds: capacity.ownFunds,
    ownFundsGap: capacity.ownFundsGap,
    purchaseHeadroom,
    renovationBuffer,
    energyMeasureExtra: capacity.energyMeasureExtra,
    summary: affordabilitySummary({
      fit: capacity.fit,
      askingPrice,
      maxPurchasePrice: capacity.maxPurchasePriceAfterCosts,
      purchaseHeadroom,
      renovationBuffer,
      ownFundsGap: capacity.ownFundsGap,
      energyMeasureExtra: capacity.energyMeasureExtra,
    }),
  };
}

export function affordabilitySummary(input: {
  fit: AffordabilityFit;
  askingPrice: number;
  /** Verwacht de kosten-koper-bewuste koopsom (capacity.maxPurchasePriceAfterCosts). */
  maxPurchasePrice: number;
  purchaseHeadroom: number | null;
  renovationBuffer: number;
  ownFundsGap: number | null;
  energyMeasureExtra: number;
}) {
  if (input.askingPrice <= 0) {
    return `Je kunt na kosten koper ongeveer ${formatEuro(input.maxPurchasePrice)} uitgeven aan een huis. Vul een vraagprijs in voor een fit-check.`;
  }
  if (input.fit === "fits") {
    const parts = [`Deze vraagprijs past, ook na kosten koper (budget ${formatEuro(input.maxPurchasePrice)}).`];
    if (input.purchaseHeadroom != null && input.purchaseHeadroom > 0) {
      parts.push(`Koopruimte: ${formatEuro(input.purchaseHeadroom)}.`);
    }
    if (input.renovationBuffer > 0) {
      parts.push(`Ongeveer ${formatEuro(input.renovationBuffer)} eigen geld over voor verbouwing of buffer.`);
    }
    if (input.energyMeasureExtra > 0) {
      parts.push(`Plus ${formatEuro(input.energyMeasureExtra)} extra leenruimte alleen voor verduurzaming.`);
    }
    return parts.join(" ");
  }
  if (input.fit === "tight") {
    const gap = Math.max(0, Math.round(input.askingPrice - input.maxPurchasePrice));
    return `Krap: je komt ná kosten koper ongeveer ${formatEuro(gap)} tekort tot je budget van ${formatEuro(input.maxPurchasePrice)}. Extra eigen geld of een lager bod kan het gat dichten.`;
  }
  if (input.fit === "over") {
    const gap = Math.max(0, Math.round(input.askingPrice - input.maxPurchasePrice));
    return `Boven je budget: dit huis kost ${formatEuro(input.askingPrice)}. Ná kosten koper kun je tot ${formatEuro(input.maxPurchasePrice)} betalen — ${formatEuro(gap)} tekort.`;
  }
  if (input.ownFundsGap != null && input.ownFundsGap > 0) {
    return `Je hebt ongeveer ${formatEuro(input.ownFundsGap)} extra eigen geld nodig voor kosten koper en inleg.`;
  }
  return `Wat je écht kunt uitgeven volgens je hypotheekschets: ${formatEuro(input.maxPurchasePrice)}.`;
}

export function fitSortRank(fit: AffordabilityFit) {
  if (fit === "fits") return 0;
  if (fit === "tight") return 1;
  if (fit === "over") return 2;
  return 3;
}

export function fitLabel(fit: AffordabilityFit) {
  if (fit === "fits") return "Past";
  if (fit === "tight") return "Krap";
  if (fit === "over") return "Te duur";
  return "Onbekend";
}

export function energyLabelFromAnalysis(analysis: { signals?: Array<{ key: string; value?: string | number | null }> } | null | undefined) {
  const signal = analysis?.signals?.find((item) => item.key === "energy");
  if (!signal || signal.value == null) return null;
  const value = String(signal.value).trim();
  if (!value || value === "Geen data") return null;
  return value;
}
