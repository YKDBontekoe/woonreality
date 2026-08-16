export type EmploymentContract = "permanent" | "temporary_intent" | "temporary" | "flex";
export type WorkType = "permanent" | "temporary" | "flex" | "self_employed" | "dga" | "pension" | "mix";
export type RepaymentType = "annuity" | "linear";
export type FixedPeriodYears = 5 | 10 | 20 | 30;
export type EnergyBand = "none" | "efg" | "cd" | "ab" | "ap" | "appp" | "apppp";
export const ENERGY_LABELS = ["A++++", "A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"] as const;
export type EnergyLabel = (typeof ENERGY_LABELS)[number];

export function parseCanonicalEnergyLabel(raw?: string | null): EnergyLabel | undefined {
  if (!raw) return undefined;
  const label = raw.trim();
  return (ENERGY_LABELS as readonly string[]).includes(label) ? label as EnergyLabel : undefined;
}

export type YearTriple = [number, number, number];

export type IncomeSource =
  | {
    kind: "employment";
    contract: EmploymentContract;
    grossAnnual: number;
    thirteenthMonth: number;
    bonus: number;
    history: YearTriple;
    perspectief: boolean;
  }
  | {
    kind: "self_employed";
    monthsActive: number;
    profits: YearTriple;
  }
  | {
    kind: "dga";
    box1: YearTriple;
    dividend: YearTriple;
    monthsActive?: number;
  }
  | { kind: "pension"; annual: number }
  | { kind: "alimony"; annual: number };

export type PersonFinance = {
  reachedAow: boolean;
  sources: IncomeSource[];
};

export type MortgageFinance = {
  applicant: PersonFinance;
  partner: PersonFinance | null;
  studentLoanMonthly: number;
  studentLoanRemaining: number;
  studentLoanSf35: boolean;
  privateLeaseMonthly: number;
  revolvingCreditLimit: number;
  installmentLoanMonthly: number;
  groundLeaseMonthly: number;
  otherMonthlyDebts: number;
  alimonyPaidMonthly: number;
  savings: number;
  gift: number;
  saleEquity: number;
  interestRate: number;
  fixedPeriodYears: FixedPeriodYears;
  repayment: RepaymentType;
  energyPerformanceGuarantee: boolean;
  includeEnergyMeasures: boolean;
  starterExemption: boolean;
  buyerAge: number;
};

export type MortgagePropertyContext = {
  energyLabel?: string | null;
  askingPrice?: number | null;
  ownFunds?: number | null;
  nhg?: boolean;
};

export type MortgageLine = {
  key: string;
  label: string;
  amount: number;
  note: string;
};

export type MortgageCapacity = {
  available: boolean;
  reason?: string;
  year: number;
  toetsinkomen: number;
  applicantIncome: number;
  partnerIncome: number;
  woonquote: number;
  allowedBurden: number;
  obligationBurden: number;
  remainingBurden: number;
  toetsrente: number;
  marketRate: number;
  incomeLoan: number;
  energyPurchaseExtra: number;
  energyMeasureExtra: number;
  singleExtra: number;
  maxLoan: number;
  maxLoanForPurchase: number;
  /** Inkomensruimte vóór NHG-plafond (aankoop). */
  uncappedMaxLoanForPurchase: number;
  /** Totale leenruimte vóór NHG-plafond (inclusief EBV). */
  uncappedMaxLoan: number;
  nhgApplies: boolean;
  nhgCapped: boolean;
  nhgLimit: number | null;
  maxPurchasePrice: number;
  monthlyPayment: number;
  monthlyPaymentToets: number;
  energyBand: EnergyBand;
  energyLabel: string | null;
  askingPrice: number;
  ownFunds: number;
  financingNeeded: number;
  buyerCosts: number | null;
  ownFundsGap: number | null;
  fit: "unknown" | "fits" | "tight" | "over";
  lines: MortgageLine[];
  disclaimer: string;
};

export type MortgageScenario = {
  id: string;
  label: string;
  maxLoanForPurchase: number;
  maxPurchasePrice: number;
  delta: number;
  note?: string;
};

export type MortgageMarketRatePoint = {
  month: string;
  rate: number;
};

export type MortgageMarketHistorySeries = {
  period: FixedPeriodYears;
  points: MortgageMarketRatePoint[];
};

export type MortgageMarketSnapshot = {
  fetchedAt: string;
  toetsrente: { rate: number; label: string; sourceUrl: string; live: boolean };
  indicativeRates: {
    asOf: string;
    source: string;
    sourceUrl: string;
    live: boolean;
    byPeriod: Record<FixedPeriodYears, { nhg: number; other: number }>;
  };
  /** Live DNB/ECB monthly history; empty when the fetch failed. */
  history: MortgageMarketHistorySeries[];
};
