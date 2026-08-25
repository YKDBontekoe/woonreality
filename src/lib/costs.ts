import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { currentMortgageReference, type MortgageReference } from "@/src/lib/mortgage/reference";
import type { BuyerProfile } from "@/src/lib/purchase";
import { formatLocaleTag } from "@/src/lib/format-locale";

export type TransferTaxProfile = Pick<BuyerProfile, "firstTimeBuyer"> & Partial<Pick<BuyerProfile, "buyerAge" | "selfOccupied" | "priorExemptionUsed">>;

export type BuyerCostCategory = "tax" | "deed" | "finance" | "optional";

export type BuyerCostLine = {
  key: string;
  label: string;
  amount: number;
  note: string;
  deductible: boolean;
  category: BuyerCostCategory;
};

export type BuyerCostOptions = {
  newBuild?: boolean;
  investment?: boolean;
  includeAdvice?: boolean;
  includeBankGuarantee?: boolean;
  includeBuyingAgent?: boolean;
  includeMoving?: boolean;
  includeInspection?: boolean;
  reference?: MortgageReference;
};

export type BuyerCostEstimate = {
  purchasePrice: number;
  lines: BuyerCostLine[];
  total: number;
  deductibleTotal: number;
  nonDeductibleTotal: number;
  transferTaxRate: number;
  ownFundsNeeded: number;
  /** Deel van de koopsom dat niet in de hypotheek past (LTV/leencapaciteit). */
  cashForPrice: number;
  financingGap: number | null;
  referenceYear: number;
  disclaimer: string;
};

/** @deprecated Prefer currentMortgageReference().transferTax — kept for existing imports. */
export const TRANSFER_TAX = {
  year: 2026,
  starterThreshold: 555_000,
  starterMinAge: 18,
  starterMaxAge: 35,
  starterRate: 0,
  standardRate: 0.02,
} as const;

export const STARTER_TRANSFER_TAX_THRESHOLD = TRANSFER_TAX.starterThreshold;

function roundEuro(value: number) {
  return Math.round(value);
}

function numberTag(locale: Locale) {
  return formatLocaleTag(locale);
}

function euroLabel(value: number, locale: Locale = "nl") {
  return new Intl.NumberFormat(numberTag(locale), { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function percentLabel(value: number, locale: Locale) {
  return (value * 100).toLocaleString(numberTag(locale));
}

export function starterExemptionEligible(profile: TransferTaxProfile, purchasePrice: number, ref = currentMortgageReference()) {
  if (!profile.firstTimeBuyer || !profile.selfOccupied || profile.priorExemptionUsed) return false;
  const tax = ref.transferTax;
  if (purchasePrice < 1 || purchasePrice > tax.starterThreshold) return false;
  const age = profile.buyerAge ?? 0;
  return age >= tax.starterMinAge && age <= tax.starterMaxAge;
}

export function transferTaxRate(profile: TransferTaxProfile, purchasePrice: number, options: Pick<BuyerCostOptions, "newBuild" | "investment" | "reference"> = {}) {
  const ref = options.reference ?? currentMortgageReference();
  if (options.newBuild) return 0;
  if (options.investment) return ref.transferTax.investorResidentialRate;
  return starterExemptionEligible(profile, purchasePrice, ref) ? ref.transferTax.starterRate : ref.transferTax.ownerOccupierRate;
}

export function estimateBuyerCosts(
  purchasePrice: number,
  profile: TransferTaxProfile & Pick<BuyerProfile, "ownFunds" | "budget"> & Partial<Pick<BuyerProfile, "nhg">> & { energySavingMeasures?: boolean },
  financingAmount?: number | null,
  options: BuyerCostOptions = {},
  locale: Locale = "nl",
): BuyerCostEstimate | null {
  if (!purchasePrice || purchasePrice < 1) return null;
  const t = getLibTranslator(locale, "lib-finance");
  const ref = options.reference ?? currentMortgageReference();
  const tax = ref.transferTax;
  const costs = ref.costs;
  const rate = transferTaxRate(profile, purchasePrice, { ...options, reference: ref });
  const thresholdLabel = euroLabel(tax.starterThreshold, locale);
  const derivedLoan = (profile.ownFunds || 0) >= purchasePrice ? 0 : purchasePrice;
  const loan = financingAmount == null ? derivedLoan : Math.max(0, Math.min(financingAmount, purchasePrice));
  const financed = loan > 0;
  const nhgLimit = profile.energySavingMeasures ? ref.nhg.energyLimit : ref.nhg.limit;
  const nhgEligible = purchasePrice > 0 && purchasePrice <= nhgLimit;
  const includeInspection = options.includeInspection !== false;
  const includeAdvice = Boolean(options.includeAdvice);
  const includeBankGuarantee = Boolean(options.includeBankGuarantee);
  const includeBuyingAgent = Boolean(options.includeBuyingAgent);
  const includeMoving = Boolean(options.includeMoving);

  const lines: BuyerCostLine[] = [];

  if (!options.newBuild) {
    let note: string;
    if (options.investment) {
      note = t("costs.lines.transferTax.noteInvestor", { rate: percentLabel(tax.investorResidentialRate, locale), year: ref.year });
    } else if (rate === tax.starterRate) {
      note = t("costs.lines.transferTax.noteStarterExemption", { threshold: thresholdLabel, year: ref.year });
    } else {
      note = t("costs.lines.transferTax.noteOwnerOccupier", {
        rate: percentLabel(tax.ownerOccupierRate, locale),
        investorRate: percentLabel(tax.investorResidentialRate, locale),
      });
    }
    lines.push({
      key: "transfer-tax",
      label: t("costs.lines.transferTax.label"),
      amount: roundEuro(purchasePrice * rate),
      note,
      deductible: false,
      category: "tax",
    });
  } else {
    lines.push({
      key: "transfer-tax",
      label: t("costs.lines.transferTax.label"),
      amount: 0,
      note: t("costs.lines.transferTax.noteNewBuild"),
      deductible: false,
      category: "tax",
    });
  }

  if (!options.newBuild) {
    lines.push({
      key: "notary-transfer",
      label: t("costs.lines.notaryTransfer.label"),
      amount: costs.transferDeed,
      note: t("costs.lines.notaryTransfer.note"),
      deductible: false,
      category: "deed",
    });
  }

  if (financed) {
    lines.push({
      key: "notary-mortgage",
      label: t("costs.lines.notaryMortgage.label"),
      amount: costs.mortgageDeed,
      note: t("costs.lines.notaryMortgage.note"),
      deductible: true,
      category: "finance",
    });
  }

  if (!options.newBuild) {
    lines.push({
      key: "kadaster-transfer",
      label: t("costs.lines.kadasterTransfer.label"),
      amount: roundEuro(ref.kadaster.kikPerDeed),
      note: t("costs.lines.kadasterTransfer.note", { year: ref.year }),
      deductible: false,
      category: "deed",
    });
  }

  if (financed) {
    lines.push({
      key: "kadaster-mortgage",
      label: t("costs.lines.kadasterMortgage.label"),
      amount: roundEuro(ref.kadaster.kikPerDeed),
      note: t("costs.lines.kadasterMortgage.note", { year: ref.year }),
      deductible: true,
      category: "finance",
    });
    lines.push({
      key: "appraisal",
      label: t("costs.lines.appraisal.label"),
      amount: costs.appraisal,
      note: t("costs.lines.appraisal.note"),
      deductible: true,
      category: "finance",
    });
  }

  if (includeInspection) {
    lines.push({
      key: "inspection",
      label: t("costs.lines.inspection.label"),
      amount: costs.inspection,
      note: t("costs.lines.inspection.note"),
      deductible: false,
      category: "optional",
    });
  }

  if (profile.nhg && nhgEligible && loan > 0) {
    lines.push({
      key: "nhg",
      label: t("costs.lines.nhg.label"),
      amount: roundEuro(loan * ref.nhg.feeRate),
      note: t("costs.lines.nhg.note", { rate: percentLabel(ref.nhg.feeRate, locale), year: ref.year, limit: euroLabel(nhgLimit, locale) }),
      deductible: true,
      category: "finance",
    });
  }

  if (includeAdvice && financed) {
    lines.push({
      key: "advice",
      label: t("costs.lines.advice.label"),
      amount: costs.advice,
      note: t("costs.lines.advice.note"),
      deductible: true,
      category: "optional",
    });
  }

  if (includeBankGuarantee && !options.newBuild) {
    const guaranteed = roundEuro(purchasePrice * costs.depositFraction);
    const fee = Math.max(250, roundEuro(guaranteed * costs.bankGuaranteeFeeRate));
    lines.push({
      key: "bank-guarantee",
      label: t("costs.lines.bankGuarantee.label"),
      amount: fee,
      note: t("costs.lines.bankGuarantee.note", { percent: percentLabel(costs.depositFraction, locale) }),
      deductible: false,
      category: "optional",
    });
  }

  if (includeBuyingAgent) {
    const agent = roundEuro(purchasePrice * costs.buyingAgentPctExclVat * (1 + costs.vatRate));
    lines.push({
      key: "buying-agent",
      label: t("costs.lines.buyingAgent.label"),
      amount: agent,
      note: t("costs.lines.buyingAgent.note", { rate: percentLabel(costs.buyingAgentPctExclVat, locale), vat: percentLabel(costs.vatRate, locale) }),
      deductible: false,
      category: "optional",
    });
  }

  if (includeMoving) {
    lines.push({
      key: "moving",
      label: t("costs.lines.moving.label"),
      amount: costs.moving,
      note: t("costs.lines.moving.note"),
      deductible: false,
      category: "optional",
    });
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const deductibleTotal = lines.reduce((sum, line) => sum + (line.deductible ? line.amount : 0), 0);
  const nonDeductibleTotal = total - deductibleTotal;
  const cashForPrice = Math.max(0, purchasePrice - loan);
  const ownFundsNeeded = total + cashForPrice;
  const financingGap = ownFundsNeeded - (profile.ownFunds || 0);

  return {
    purchasePrice,
    lines,
    total,
    deductibleTotal,
    nonDeductibleTotal,
    transferTaxRate: rate,
    ownFundsNeeded,
    cashForPrice,
    financingGap,
    referenceYear: ref.year,
    disclaimer: t("costs.disclaimer", { year: ref.year }),
  };
}
