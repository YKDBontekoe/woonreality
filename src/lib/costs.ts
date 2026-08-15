import type { BuyerProfile } from "@/src/lib/purchase";

export const STARTER_TRANSFER_TAX_THRESHOLD = 525_000;

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

export function transferTaxRate(profile: Pick<BuyerProfile, "firstTimeBuyer">, purchasePrice: number) {
  if (profile.firstTimeBuyer && purchasePrice > 0 && purchasePrice <= STARTER_TRANSFER_TAX_THRESHOLD) return 0;
  return 0.02;
}

export function estimateBuyerCosts(purchasePrice: number, profile: Pick<BuyerProfile, "firstTimeBuyer" | "ownFunds" | "budget">, financingAmount?: number | null): BuyerCostEstimate | null {
  if (!purchasePrice || purchasePrice < 1) return null;
  const rate = transferTaxRate(profile, purchasePrice);
  const lines: BuyerCostLine[] = [
    {
      key: "transfer-tax",
      label: "Overdrachtsbelasting",
      amount: roundEuro(purchasePrice * rate),
      note: rate === 0 ? "Startersvrijstelling tot € 525.000 (indicatie; leeftijd en hoofdverblijf moet de notaris toetsen)." : "2% voor een woning als hoofdverblijf. Beleggingswoningen vallen hier buiten.",
    },
    { key: "notary", label: "Notaris (indicatie)", amount: 1_250, note: "Levering en hypotheekakte. Vraag een offerte." },
    { key: "appraisal", label: "Taxatie (indicatie)", amount: 800, note: "Vaak verplicht voor de hypotheek. Geen WoonReality-waardering." },
    { key: "inspection", label: "Bouwkundige keuring (indicatie)", amount: 500, note: "Laat een erkend inspecteur kijken, zeker bij oudere bouw." },
    { key: "kadaster", label: "Kadaster / inschrijving", amount: 90, note: "Inschrijving levering en hypotheek." },
  ];
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const loan = financingAmount && financingAmount > 0 ? financingAmount : Math.max(0, purchasePrice - (profile.ownFunds || 0));
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
