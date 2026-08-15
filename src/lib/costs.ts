import { NHG } from "@/src/lib/mortgage/norms-2026";
import type { BuyerProfile } from "@/src/lib/purchase";

export const TRANSFER_TAX = {
  year: 2026,
  starterThreshold: 555_000,
  starterMinAge: 18,
  starterMaxAge: 35,
  starterRate: 0,
  standardRate: 0.02,
} as const;

export const STARTER_TRANSFER_TAX_THRESHOLD = TRANSFER_TAX.starterThreshold;

export type TransferTaxProfile = Pick<BuyerProfile, "firstTimeBuyer"> & Partial<Pick<BuyerProfile, "buyerAge" | "selfOccupied" | "priorExemptionUsed">>;

export type BuyerCostLine = {
  key: string;
  label: string;
  amount: number;
  note: string;
};

export type BuyerCostEstimate = {
  purchasePrice: number;
  lines: BuyerCostLine[];
  total: number;
  transferTaxRate: number;
  ownFundsNeeded: number;
  financingGap: number | null;
  disclaimer: string;
};

function roundEuro(value: number) {
  return Math.round(value);
}

export function starterExemptionEligible(profile: TransferTaxProfile, purchasePrice: number) {
  if (!profile.firstTimeBuyer || !profile.selfOccupied || profile.priorExemptionUsed) return false;
  if (purchasePrice < 1 || purchasePrice > TRANSFER_TAX.starterThreshold) return false;
  const age = profile.buyerAge ?? 0;
  return age >= TRANSFER_TAX.starterMinAge && age <= TRANSFER_TAX.starterMaxAge;
}

export function transferTaxRate(profile: TransferTaxProfile, purchasePrice: number) {
  return starterExemptionEligible(profile, purchasePrice) ? TRANSFER_TAX.starterRate : TRANSFER_TAX.standardRate;
}

export function estimateBuyerCosts(purchasePrice: number, profile: TransferTaxProfile & Pick<BuyerProfile, "ownFunds" | "budget"> & Partial<Pick<BuyerProfile, "nhg">>, financingAmount?: number | null): BuyerCostEstimate | null {
  if (!purchasePrice || purchasePrice < 1) return null;
  const rate = transferTaxRate(profile, purchasePrice);
  const thresholdLabel = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(TRANSFER_TAX.starterThreshold);
  const loan = financingAmount && financingAmount > 0 ? financingAmount : Math.max(0, purchasePrice - (profile.ownFunds || 0));
  const lines: BuyerCostLine[] = [
    {
      key: "transfer-tax",
      label: "Overdrachtsbelasting",
      amount: roundEuro(purchasePrice * rate),
      note: rate === TRANSFER_TAX.starterRate
        ? `Startersvrijstelling tot ${thresholdLabel} (${TRANSFER_TAX.year}; indicatie 0–2% tot de notaris leeftijd, hoofdverblijf en eerdere vrijstelling toetst).`
        : "2% voor een woning als hoofdverblijf. Beleggingswoningen vallen hier buiten. Startersvrijstelling hangt af van leeftijd, zelfbewoning en eerdere vrijstelling.",
    },
    { key: "notary", label: "Notaris (indicatie)", amount: 1_250, note: "Levering en hypotheekakte. Vraag een offerte." },
    { key: "appraisal", label: "Taxatie (indicatie)", amount: 800, note: "Vaak verplicht voor de hypotheek. Geen WoonReality-waardering." },
    { key: "inspection", label: "Bouwkundige keuring (indicatie)", amount: 500, note: "Laat een erkend inspecteur kijken, zeker bij oudere bouw." },
    { key: "kadaster", label: "Kadaster / inschrijving", amount: 90, note: "Inschrijving levering en hypotheek." },
  ];
  if (profile.nhg && purchasePrice > 0 && purchasePrice <= NHG.limit && loan > 0) {
    lines.push({
      key: "nhg",
      label: "NHG-borgtochtprovisie",
      amount: roundEuro(loan * NHG.feeRate),
      note: `0,4% van de hypotheeksom (${TRANSFER_TAX.year}; grens ${new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(NHG.limit)}). Vaak meegefinancierd.`,
    });
  }
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const cashForPrice = Math.max(0, purchasePrice - loan);
  const ownFundsNeeded = total + cashForPrice;
  const financingGap = profile.ownFunds > 0 ? ownFundsNeeded - profile.ownFunds : null;
  return {
    purchasePrice,
    lines,
    total,
    transferTaxRate: rate,
    ownFundsNeeded,
    financingGap,
    disclaimer: "Dit is een rekenschets, geen hypotheekadvies. NHG, rente en bankvoorwaarden horen bij een erkend adviseur.",
  };
}
