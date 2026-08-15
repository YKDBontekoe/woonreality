import type { IncomeSource, PersonFinance, YearTriple } from "@/src/lib/mortgage/types";

export function emptyTriple(): YearTriple {
  return [0, 0, 0];
}

/** NHG IKV: average of 3 years, capped at the most recent year. Missing years count as 0. */
export function threeYearToetsinkomen(years: YearTriple) {
  const last = years[0] || 0;
  const avg = ((years[0] || 0) + (years[1] || 0) + (years[2] || 0)) / 3;
  return Math.max(0, Math.min(avg, last));
}

export function incomeFromSource(source: IncomeSource, options?: { nhg?: boolean }) {
  if (options?.nhg && (source.kind === "self_employed" || source.kind === "dga")) {
    const months = source.monthsActive ?? 36;
    if (months < 12) return 0;
  }
  if (source.kind === "employment") {
    const current = Math.max(0, source.grossAnnual) + Math.max(0, source.thirteenthMonth) + Math.max(0, source.bonus);
    const stable = source.contract === "permanent" || source.contract === "temporary_intent" || source.perspectief;
    if (stable) return current;
    const historic = threeYearToetsinkomen(source.history);
    if (current > 0) return Math.min(historic, current);
    return historic;
  }
  if (source.kind === "self_employed") {
    if (source.profits[0] <= 0) return 0;
    return threeYearToetsinkomen(source.profits);
  }
  if (source.kind === "dga") {
    const box1 = source.box1[0] <= 0 ? 0 : threeYearToetsinkomen(source.box1);
    const dividend = threeYearToetsinkomen(source.dividend);
    const profitCap = Math.max(box1, threeYearToetsinkomen(source.box1));
    return box1 + Math.min(dividend, profitCap || dividend);
  }
  if (source.kind === "pension" || source.kind === "alimony") return Math.max(0, source.annual);
  return 0;
}

export function incomeFromPerson(person: PersonFinance | null | undefined, options?: { nhg?: boolean }) {
  if (!person) return 0;
  return person.sources.reduce((sum, source) => sum + incomeFromSource(source, options), 0);
}

export function emptyPerson(): PersonFinance {
  return { reachedAow: false, sources: [] };
}

export function defaultEmploymentSource(): Extract<IncomeSource, { kind: "employment" }> {
  return {
    kind: "employment",
    contract: "permanent",
    grossAnnual: 0,
    thirteenthMonth: 0,
    bonus: 0,
    history: emptyTriple(),
    perspectief: false,
  };
}

export function defaultSelfEmployedSource(): Extract<IncomeSource, { kind: "self_employed" }> {
  return { kind: "self_employed", monthsActive: 36, profits: emptyTriple() };
}

export function defaultDgaSource(): Extract<IncomeSource, { kind: "dga" }> {
  return { kind: "dga", box1: emptyTriple(), dividend: emptyTriple(), monthsActive: 36 };
}

export function defaultPensionSource(): Extract<IncomeSource, { kind: "pension" }> {
  return { kind: "pension", annual: 0 };
}
