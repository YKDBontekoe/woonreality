import { studentLoanGrossFactor } from "@/src/lib/mortgage/norms-2026";
import type { MortgageFinance, MortgageLine } from "@/src/lib/mortgage/types";

/** Gangbare toetsing voor revolverend krediet / creditcardlimiet (BKR RK). */
export const REVOLVING_MONTHLY_FACTOR = 0.02;

/** Restschuldtoets als het DUO-termijnbedrag ontbreekt: SF35 0,35%, ouder stelsel 0,65%. */
export const STUDENT_REMAINING_MONTHLY_FACTOR = {
  sf35: 0.0035,
  legacy: 0.0065,
} as const;

export function studentLoanMonthlyForTest(finance: Pick<MortgageFinance, "studentLoanMonthly" | "studentLoanRemaining" | "studentLoanSf35">) {
  if (finance.studentLoanMonthly > 0) return finance.studentLoanMonthly;
  if (finance.studentLoanRemaining <= 0) return 0;
  const factor = finance.studentLoanSf35 ? STUDENT_REMAINING_MONTHLY_FACTOR.sf35 : STUDENT_REMAINING_MONTHLY_FACTOR.legacy;
  return finance.studentLoanRemaining * factor;
}

function roundEuro(value: number) {
  return Math.round(value);
}

export function ownFundsTotal(finance: Pick<MortgageFinance, "savings" | "gift" | "saleEquity">) {
  return Math.max(0, finance.savings) + Math.max(0, finance.gift) + Math.max(0, finance.saleEquity);
}

export function obligationLines(finance: MortgageFinance, toetsrente: number): MortgageLine[] {
  const studentFactor = studentLoanGrossFactor(toetsrente);
  const studentMonthly = studentLoanMonthlyForTest(finance);
  const items: MortgageLine[] = [];
  if (finance.privateLeaseMonthly > 0) {
    items.push({
      key: "lease",
      label: "Private lease",
      amount: -roundEuro(finance.privateLeaseMonthly * 12),
      note: "Werkelijke maandlast (NHG/BKR OA sinds april 2022, 100% van het contract).",
    });
  }
  if (studentMonthly > 0) {
    const usedRemaining = finance.studentLoanMonthly <= 0 && finance.studentLoanRemaining > 0;
    items.push({
      key: "student",
      label: "Studieschuld",
      amount: -roundEuro(usedRemaining ? studentMonthly * 12 : studentMonthly * 12 * studentFactor),
      note: usedRemaining
        ? `${finance.studentLoanSf35 ? "0,35% (SF35)" : "0,65% (oud stelsel)"} van de restschuld per maand, omdat het DUO-termijnbedrag ontbreekt.`
        : `DUO-termijnbedrag gebruteerd met factor ${studentFactor.toLocaleString("nl-NL", { minimumFractionDigits: 2 })} (art. 3a).`,
    });
  }
  if (finance.revolvingCreditLimit > 0) {
    items.push({
      key: "revolving",
      label: "Doorlopend krediet / creditcard",
      amount: -roundEuro(finance.revolvingCreditLimit * REVOLVING_MONTHLY_FACTOR * 12),
      note: `${(REVOLVING_MONTHLY_FACTOR * 100).toFixed(0)}% per maand van de limiet (gangbare BKR RK-toets).`,
    });
  }
  if (finance.installmentLoanMonthly > 0) {
    items.push({
      key: "installment",
      label: "Leningen (auto, persoonlijk)",
      amount: -roundEuro(finance.installmentLoanMonthly * 12),
      note: "Werkelijke maandlast van aflopend krediet.",
    });
  }
  if (finance.groundLeaseMonthly > 0) {
    items.push({
      key: "erfpacht",
      label: "Erfpachtcanon",
      amount: -roundEuro(finance.groundLeaseMonthly * 12),
      note: "Jaarlijkse canon telt mee als financiële verplichting bij deze woning.",
    });
  }
  if (finance.alimonyPaidMonthly > 0) {
    items.push({
      key: "alimony",
      label: "Alimentatie",
      amount: -roundEuro(finance.alimonyPaidMonthly * 12),
      note: "Partner- en kinderalimentatie die je betaalt.",
    });
  }
  if (finance.otherMonthlyDebts > 0) {
    items.push({
      key: "other-debts",
      label: "Overige maandlasten",
      amount: -roundEuro(finance.otherMonthlyDebts * 12),
      note: "Overige BKR- of vaste verplichtingen.",
    });
  }
  return items;
}

export function obligationAnnualTotal(finance: MortgageFinance, toetsrente: number) {
  return obligationLines(finance, toetsrente).reduce((sum, line) => sum - line.amount, 0);
}
