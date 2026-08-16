import { currentMortgageReference, type MortgageReference } from "@/src/lib/mortgage/reference";
import type { BuyerProfile } from "@/src/lib/purchase";

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

function euroLabel(value: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
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
): BuyerCostEstimate | null {
  if (!purchasePrice || purchasePrice < 1) return null;
  const ref = options.reference ?? currentMortgageReference();
  const tax = ref.transferTax;
  const costs = ref.costs;
  const rate = transferTaxRate(profile, purchasePrice, { ...options, reference: ref });
  const thresholdLabel = euroLabel(tax.starterThreshold);
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
      note = `${(tax.investorResidentialRate * 100).toLocaleString("nl-NL")}% voor een woning die niet als hoofdverblijf geldt (${ref.year}). Niet aftrekbaar.`;
    } else if (rate === tax.starterRate) {
      note = `Startersvrijstelling tot ${thresholdLabel} (${ref.year}; leeftijd, zelfbewoning en eerdere vrijstelling toetst de notaris). Niet aftrekbaar.`;
    } else {
      note = `${(tax.ownerOccupierRate * 100).toLocaleString("nl-NL")}% voor een woning als hoofdverblijf. Belegging: ${(tax.investorResidentialRate * 100).toLocaleString("nl-NL")}%. Startersvrijstelling hangt af van leeftijd en zelfbewoning. Niet aftrekbaar.`;
    }
    lines.push({
      key: "transfer-tax",
      label: "Overdrachtsbelasting",
      amount: roundEuro(purchasePrice * rate),
      note,
      deductible: false,
      category: "tax",
    });
  } else {
    lines.push({
      key: "transfer-tax",
      label: "Overdrachtsbelasting",
      amount: 0,
      note: "Nieuwbouw v.o.n.: btw zit in de koopsom, geen overdrachtsbelasting.",
      deductible: false,
      category: "tax",
    });
  }

  if (!options.newBuild) {
    lines.push({
      key: "notary-transfer",
      label: "Notaris leveringsakte (indicatie)",
      amount: costs.transferDeed,
      note: "Transportakte van de woning. Niet aftrekbaar. Vraag een offerte.",
      deductible: false,
      category: "deed",
    });
  }

  if (financed) {
    lines.push({
      key: "notary-mortgage",
      label: "Notaris hypotheekakte (indicatie)",
      amount: costs.mortgageDeed,
      note: "Financieringskosten: aftrekbaar in box 1 in het jaar van betaling.",
      deductible: true,
      category: "finance",
    });
  }

  if (!options.newBuild) {
    lines.push({
      key: "kadaster-transfer",
      label: "Kadaster levering",
      amount: roundEuro(ref.kadaster.kikPerDeed),
      note: `Inschrijving levering (${ref.year} KIK-tarief). Niet aftrekbaar.`,
      deductible: false,
      category: "deed",
    });
  }

  if (financed) {
    lines.push({
      key: "kadaster-mortgage",
      label: "Kadaster hypotheek",
      amount: roundEuro(ref.kadaster.kikPerDeed),
      note: `Inschrijving hypotheek (${ref.year} KIK-tarief). Aftrekbaar als financieringskosten.`,
      deductible: true,
      category: "finance",
    });
    lines.push({
      key: "appraisal",
      label: "Taxatie (indicatie)",
      amount: costs.appraisal,
      note: "Vaak verplicht voor de hypotheek. Aftrekbaar als de taxatie voor de lening nodig is. Geen WoonReality-waardering.",
      deductible: true,
      category: "finance",
    });
  }

  if (includeInspection) {
    lines.push({
      key: "inspection",
      label: "Bouwkundige keuring (indicatie)",
      amount: costs.inspection,
      note: "Optioneel maar sterk aangeraden bij oudere bouw. Niet aftrekbaar.",
      deductible: false,
      category: "optional",
    });
  }

  if (profile.nhg && nhgEligible && loan > 0) {
    lines.push({
      key: "nhg",
      label: "NHG-borgtochtprovisie",
      amount: roundEuro(loan * ref.nhg.feeRate),
      note: `${(ref.nhg.feeRate * 100).toLocaleString("nl-NL")}% van de hypotheeksom (${ref.year}; grens ${euroLabel(nhgLimit)}). Aftrekbaar. Vaak meegefinancierd.`,
      deductible: true,
      category: "finance",
    });
  }

  if (includeAdvice && financed) {
    lines.push({
      key: "advice",
      label: "Hypotheekadvies (indicatie)",
      amount: costs.advice,
      note: "Advies- en bemiddelingskosten voor de hypotheek. Aftrekbaar in box 1. Vraag een offerte.",
      deductible: true,
      category: "optional",
    });
  }

  if (includeBankGuarantee && !options.newBuild) {
    const guaranteed = roundEuro(purchasePrice * costs.depositFraction);
    const fee = Math.max(250, roundEuro(guaranteed * costs.bankGuaranteeFeeRate));
    lines.push({
      key: "bank-guarantee",
      label: "Bankgarantie (indicatie)",
      amount: fee,
      note: `In plaats van ${(costs.depositFraction * 100).toLocaleString("nl-NL")}% waarborgsom contant. Niet aftrekbaar.`,
      deductible: false,
      category: "optional",
    });
  }

  if (includeBuyingAgent) {
    const agent = roundEuro(purchasePrice * costs.buyingAgentPctExclVat * (1 + costs.vatRate));
    lines.push({
      key: "buying-agent",
      label: "Aankoopmakelaar (indicatie)",
      amount: agent,
      note: `${(costs.buyingAgentPctExclVat * 100).toLocaleString("nl-NL")}% excl. btw + ${(costs.vatRate * 100).toLocaleString("nl-NL")}% btw. Niet aftrekbaar.`,
      deductible: false,
      category: "optional",
    });
  }

  if (includeMoving) {
    lines.push({
      key: "moving",
      label: "Verhuiskosten (indicatie)",
      amount: costs.moving,
      note: "Geen vaste post; hangt af van afstand en volume. Niet aftrekbaar.",
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
    disclaimer: `Dit is een rekenschets op basis van parameters ${ref.year}, geen hypotheekadvies. Notaris- en adviseurstarieven zijn indicaties; NHG, rente en bankvoorwaarden horen bij een erkend adviseur.`,
  };
}
