import { currentMortgageReference } from "@/src/lib/mortgage/reference";
import type { EnergyBand, FixedPeriodYears } from "@/src/lib/mortgage/types";

const ref = currentMortgageReference();

export const MORTGAGE_NORMS_YEAR = ref.year;

export const MORTGAGE_SOURCE = {
  regulation: "https://wetten.overheid.nl/BWBR0032503/2026-01-01/0",
  energy: "https://www.volkshuisvestingnederland.nl/onderwerpen/huren-en-wonen/tijdelijke-regeling-hypothecair-krediet/maximale-hypotheek-op-basis-van-energielabel",
  nhg: ref.sources.nhg,
  ikv: "NHG Toetskaders Inkomensverklaring Ondernemer 01.2026",
} as const;

export const AFM_TOETSRENTE_FLOOR = 5;
export const LOAN_TERM_YEARS = 30;
export const SINGLE_EXTRA = 17_000;
export const SINGLE_INCOME_THRESHOLD = 30_000;
export const AOW_SINGLE_INCOME_THRESHOLD = 29_000;

export const NHG = {
  limit: ref.nhg.limit,
  energyLimit: ref.nhg.energyLimit,
  feeRate: ref.nhg.feeRate,
} as const;

export function nhgKostengrens(energySavingMeasures = false) {
  return energySavingMeasures ? NHG.energyLimit : NHG.limit;
}

/** Property-value + EBV check shared by capacity caps and the NHG fee. */
export function isNhgEligible(purchasePrice: number, energySavingMeasures = false) {
  return purchasePrice > 0 && purchasePrice <= nhgKostengrens(energySavingMeasures);
}

export const LTV = {
  standard: 1,
  withEnergyMeasures: 1.06,
} as const;

export const ENERGY_PURCHASE_EXTRA: Record<EnergyBand, number> = {
  none: 0,
  efg: 0,
  cd: 5_000,
  ab: 10_000,
  ap: 20_000,
  appp: 25_000,
  apppp: 30_000,
};

export const ENERGY_MEASURE_EXTRA: Record<EnergyBand, number> = {
  none: 10_000,
  efg: 20_000,
  cd: 15_000,
  ab: 10_000,
  ap: 10_000,
  appp: 0,
  apppp: 0,
};

export const ENERGY_GUARANTEE_EXTRA = 40_000;

export const STUDENT_LOAN_GROSS_FACTOR: { maxRate: number; factor: number }[] = [
  { maxRate: 2.0, factor: 1.05 },
  { maxRate: 2.5, factor: 1.10 },
  { maxRate: 3.0, factor: 1.15 },
  { maxRate: 3.5, factor: 1.20 },
  { maxRate: 4.0, factor: 1.20 },
  { maxRate: 4.5, factor: 1.25 },
  { maxRate: 5.0, factor: 1.30 },
  { maxRate: 5.5, factor: 1.30 },
  { maxRate: 6.0, factor: 1.35 },
  { maxRate: 100, factor: 1.40 },
];

/** Indicative market rates, not live bank quotes. */
export const INDICATIVE_RATES = {
  asOf: "2026-06",
  byPeriod: {
    5: { nhg: 3.72, other: 3.92 },
    10: { nhg: 3.54, other: 3.74 },
    20: { nhg: 3.05, other: 3.25 },
    30: { nhg: 3.05, other: 3.25 },
  },
} as const;

export const MORTGAGE_DISCLAIMER = "Dit is het wettelijke maximum volgens de leennormen 2026, geen hypotheekadvies en geen bankofferte. Banken toetsen strenger (documenten, BKR, ondernemers vaak via IKV) en komen vaak lager uit.";

export function indicativeRate(period: FixedPeriodYears, nhg: boolean) {
  const row = INDICATIVE_RATES.byPeriod[period];
  return nhg ? row.nhg : row.other;
}

export function studentLoanGrossFactor(toetsrente: number) {
  const row = STUDENT_LOAN_GROSS_FACTOR.find((item) => toetsrente <= item.maxRate);
  return row?.factor ?? 1.4;
}

export function toetsrenteFor(rate: number, fixedPeriodYears: number, afmFloor = AFM_TOETSRENTE_FLOOR) {
  if (fixedPeriodYears >= 10) return Math.max(0, rate);
  return Math.max(rate, afmFloor);
}

export function normalizeEnergyLabel(raw?: string | null): { band: EnergyBand; label: string | null } {
  if (!raw) return { band: "none", label: null };
  const compact = raw.toUpperCase().replace(/PLUS/g, "+").replace(/\s+/g, "");
  const match = compact.match(/A\+{0,4}|[B-G]/);
  if (!match) return { band: "none", label: null };
  const token = match[0];
  if (token.startsWith("A++++") || token === "A++++") return { band: "apppp", label: "A++++" };
  if (token.startsWith("A+++")) return { band: "appp", label: "A+++" };
  if (token.startsWith("A++") || token === "A+") return { band: "ap", label: token.startsWith("A++") ? "A++" : "A+" };
  if (token === "A" || token === "B") return { band: "ab", label: token };
  if (token === "C" || token === "D") return { band: "cd", label: token };
  return { band: "efg", label: token };
}

export function energyPurchaseExtra(band: EnergyBand, guarantee: boolean) {
  if (band === "apppp" && guarantee) return ENERGY_GUARANTEE_EXTRA;
  return ENERGY_PURCHASE_EXTRA[band];
}

export function energyMeasureExtra(band: EnergyBand) {
  return ENERGY_MEASURE_EXTRA[band];
}
