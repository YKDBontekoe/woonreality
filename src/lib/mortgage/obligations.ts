import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { studentLoanGrossFactor } from "@/src/lib/mortgage/norms-2026";
import type { MortgageFinance, MortgageLine } from "@/src/lib/mortgage/types";

/** Gangbare toetsing voor revolverend krediet / creditcardlimiet (BKR RK). */
export const REVOLVING_MONTHLY_FACTOR = 0.02;

/** Restschuldtoets als het DUO-termijnbedrag ontbreekt: SF35 0,35%, ouder stelsel 0,65%. */
export const STUDENT_REMAINING_MONTHLY_FACTOR = {
  sf35: 0.0035,
  legacy: 0.0065,
} as const;

function numberTag(locale: Locale) {
  return locale === "en" ? "en-IE" : "nl-NL";
}

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

export function obligationLines(finance: MortgageFinance, toetsrente: number, locale: Locale = "nl"): MortgageLine[] {
  const t = getLibTranslator(locale, "lib-finance");
  const numTag = numberTag(locale);
  const studentFactor = studentLoanGrossFactor(toetsrente);
  const studentMonthly = studentLoanMonthlyForTest(finance);
  const items: MortgageLine[] = [];
  if (finance.privateLeaseMonthly > 0) {
    items.push({
      key: "lease",
      label: t("mortgage.obligations.lease.label"),
      amount: -roundEuro(finance.privateLeaseMonthly * 12),
      note: t("mortgage.obligations.lease.note"),
    });
  }
  if (studentMonthly > 0) {
    const usedRemaining = finance.studentLoanMonthly <= 0 && finance.studentLoanRemaining > 0;
    items.push({
      key: "student",
      label: t("mortgage.obligations.student.label"),
      amount: -roundEuro(usedRemaining ? studentMonthly * 12 : studentMonthly * 12 * studentFactor),
      note: usedRemaining
        ? t("mortgage.obligations.student.noteRemaining", {
          bracket: finance.studentLoanSf35 ? t("mortgage.obligations.student.bracketSf35") : t("mortgage.obligations.student.bracketLegacy"),
        })
        : t("mortgage.obligations.student.noteTerm", { factor: studentFactor.toLocaleString(numTag, { minimumFractionDigits: 2 }) }),
    });
  }
  if (finance.revolvingCreditLimit > 0) {
    items.push({
      key: "revolving",
      label: t("mortgage.obligations.revolving.label"),
      amount: -roundEuro(finance.revolvingCreditLimit * REVOLVING_MONTHLY_FACTOR * 12),
      note: t("mortgage.obligations.revolving.note", { percent: (REVOLVING_MONTHLY_FACTOR * 100).toFixed(0) }),
    });
  }
  if (finance.installmentLoanMonthly > 0) {
    items.push({
      key: "installment",
      label: t("mortgage.obligations.installment.label"),
      amount: -roundEuro(finance.installmentLoanMonthly * 12),
      note: t("mortgage.obligations.installment.note"),
    });
  }
  if (finance.groundLeaseMonthly > 0) {
    items.push({
      key: "erfpacht",
      label: t("mortgage.obligations.groundLease.label"),
      amount: -roundEuro(finance.groundLeaseMonthly * 12),
      note: t("mortgage.obligations.groundLease.note"),
    });
  }
  if (finance.alimonyPaidMonthly > 0) {
    items.push({
      key: "alimony",
      label: t("mortgage.obligations.alimony.label"),
      amount: -roundEuro(finance.alimonyPaidMonthly * 12),
      note: t("mortgage.obligations.alimony.note"),
    });
  }
  if (finance.otherMonthlyDebts > 0) {
    items.push({
      key: "other-debts",
      label: t("mortgage.obligations.otherDebts.label"),
      amount: -roundEuro(finance.otherMonthlyDebts * 12),
      note: t("mortgage.obligations.otherDebts.note"),
    });
  }
  return items;
}

export function obligationAnnualTotal(finance: MortgageFinance, toetsrente: number, locale: Locale = "nl") {
  return obligationLines(finance, toetsrente, locale).reduce((sum, line) => sum - line.amount, 0);
}
