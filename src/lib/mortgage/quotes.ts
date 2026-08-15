import tables from "@/src/lib/mortgage/financieringslast-2026.json";

type QuoteTable = { income: number; quotes: number[] }[];

const RATE_CEILINGS = tables.rateCeilings as number[];

function tableFor(aow: boolean, deductible: boolean): QuoteTable {
  if (aow && deductible) return tables.tables.aow as QuoteTable;
  if (aow && !deductible) return tables.tables.aowNonDeductible as QuoteTable;
  if (!deductible) return tables.tables.preAowNonDeductible as QuoteTable;
  return tables.tables.preAow as QuoteTable;
}

function rateIndex(toetsrente: number) {
  const idx = RATE_CEILINGS.findIndex((ceiling) => toetsrente <= ceiling);
  return idx === -1 ? RATE_CEILINGS.length - 1 : idx;
}

function rowForIncome(rows: QuoteTable, income: number) {
  let chosen = rows[0];
  for (const row of rows) {
    if (income >= row.income) chosen = row;
    else break;
  }
  return chosen;
}

export function financieringslastPercentage(toetsinkomen: number, toetsrente: number, reachedAow: boolean, deductible = true) {
  const row = rowForIncome(tableFor(reachedAow, deductible), Math.max(0, toetsinkomen));
  const quote = row.quotes[rateIndex(toetsrente)] ?? row.quotes[row.quotes.length - 1];
  return Math.round(quote * 10) / 1000;
}

export const WOONQUOTE_SOURCE = {
  url: tables.source,
  title: tables.sourceTitle,
  effectiveFrom: tables.effectiveFrom,
};
