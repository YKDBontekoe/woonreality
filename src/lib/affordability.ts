import { calculateMortgageCapacity } from "@/src/lib/mortgage/capacity";
import { calculatorStateToFinance, type CalculatorState } from "@/src/lib/mortgage/calculator-state";
import type { MortgageCapacity, MortgageFinance } from "@/src/lib/mortgage/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
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

export function computePropertyAffordability(input: AffordabilityInput, locale: Locale = "nl"): PropertyAffordability {
  const t = getLibTranslator(locale, "lib-finance");
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
      ? t("mortgage.affordability.emptyNoFinance")
      : t("mortgage.affordability.emptyNoPrice"),
  };
  if (!finance) return empty;

  const capacity = calculateMortgageCapacity(finance, {
    askingPrice: askingPrice > 0 ? askingPrice : undefined,
    energyLabel: input.energyLabel,
    nhg: input.nhg ?? (input.state?.nhg ?? false),
    ownFunds: input.ownFunds,
  }, undefined, locale);

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
    }, locale),
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
}, locale: Locale = "nl") {
  const t = getLibTranslator(locale, "lib-finance");
  const euro = (value: number) => formatEuro(value, locale);
  if (input.askingPrice <= 0) {
    return t("mortgage.affordability.noAskingPrice", { budget: euro(input.maxPurchasePrice) });
  }
  if (input.fit === "fits") {
    const parts = [t("mortgage.affordability.fitsBase", { budget: euro(input.maxPurchasePrice) })];
    if (input.purchaseHeadroom != null && input.purchaseHeadroom > 0) {
      parts.push(t("mortgage.affordability.headroom", { value: euro(input.purchaseHeadroom) }));
    }
    if (input.renovationBuffer > 0) {
      parts.push(t("mortgage.affordability.renovationBuffer", { value: euro(input.renovationBuffer) }));
    }
    if (input.energyMeasureExtra > 0) {
      parts.push(t("mortgage.affordability.energyExtra", { value: euro(input.energyMeasureExtra) }));
    }
    return parts.join(" ");
  }
  if (input.fit === "tight") {
    const gap = Math.max(0, Math.round(input.askingPrice - input.maxPurchasePrice));
    return t("mortgage.affordability.tight", { gap: euro(gap), budget: euro(input.maxPurchasePrice) });
  }
  if (input.fit === "over") {
    const gap = Math.max(0, Math.round(input.askingPrice - input.maxPurchasePrice));
    return t("mortgage.affordability.over", { price: euro(input.askingPrice), budget: euro(input.maxPurchasePrice), gap: euro(gap) });
  }
  if (input.ownFundsGap != null && input.ownFundsGap > 0) {
    return t("mortgage.affordability.needOwnFunds", { gap: euro(input.ownFundsGap) });
  }
  return t("mortgage.affordability.fallback", { budget: euro(input.maxPurchasePrice) });
}

export function fitSortRank(fit: AffordabilityFit) {
  if (fit === "fits") return 0;
  if (fit === "tight") return 1;
  if (fit === "over") return 2;
  return 3;
}

export function fitLabel(fit: AffordabilityFit, locale: Locale = "nl") {
  return getLibTranslator(locale, "lib-finance")(`mortgage.affordability.fitLabels.${fit}`);
}

export function energyLabelFromAnalysis(analysis: { signals?: Array<{ key: string; value?: string | number | null }> } | null | undefined) {
  const signal = analysis?.signals?.find((item) => item.key === "energy");
  if (!signal || signal.value == null) return null;
  const value = String(signal.value).trim();
  if (!value || value === "Geen data") return null;
  return value;
}
