import { LOAN_TERM_YEARS } from "@/src/lib/mortgage/norms-2026";
import type { RepaymentType } from "@/src/lib/mortgage/types";

export type ScheduleMonth = {
  month: number;
  year: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
  cumulativeInterest: number;
};

export type ScheduleYear = {
  year: number;
  payment: number;
  interest: number;
  principal: number;
  balanceEnd: number;
  cumulativeInterest: number;
};

export type MortgageSchedule = {
  repayment: RepaymentType;
  principal: number;
  annualRatePercent: number;
  months: ScheduleMonth[];
  years: ScheduleYear[];
  totalInterest: number;
  firstPayment: number;
  lastPayment: number;
};

export function annuityPayment(principal: number, annualRatePercent: number, years = LOAN_TERM_YEARS) {
  const n = years * 12;
  const monthly = (annualRatePercent / 100) / 12;
  if (principal <= 0) return 0;
  if (monthly <= 0) return principal / n;
  return principal * monthly * ((1 + monthly) ** n) / (((1 + monthly) ** n) - 1);
}

export function maxPrincipalFromAnnualBurden(annualBurden: number, annualRatePercent: number, years = LOAN_TERM_YEARS) {
  const monthlyPayment = Math.max(0, annualBurden) / 12;
  const n = years * 12;
  const monthly = (annualRatePercent / 100) / 12;
  if (monthlyPayment <= 0) return 0;
  if (monthly <= 0) return monthlyPayment * n;
  return monthlyPayment * (((1 + monthly) ** n) - 1) / (monthly * ((1 + monthly) ** n));
}

export function linearFirstMonth(principal: number, annualRatePercent: number, years = LOAN_TERM_YEARS) {
  const n = years * 12;
  const monthly = (annualRatePercent / 100) / 12;
  if (principal <= 0) return 0;
  return principal / n + principal * monthly;
}

export function buildMortgageSchedule(
  principal: number,
  annualRatePercent: number,
  repayment: RepaymentType,
  years = LOAN_TERM_YEARS,
): MortgageSchedule {
  const n = years * 12;
  const r = (annualRatePercent / 100) / 12;
  const months: ScheduleMonth[] = [];
  let balance = Math.max(0, principal);
  let cumulativeInterest = 0;
  const annuity = repayment === "annuity" ? annuityPayment(principal, annualRatePercent, years) : 0;
  const linearPrincipal = repayment === "linear" && n > 0 ? principal / n : 0;

  for (let month = 1; month <= n && balance > 0.005; month += 1) {
    const interest = balance * r;
    let principalPart: number;
    let payment: number;
    if (repayment === "annuity") {
      payment = annuity;
      principalPart = Math.min(balance, payment - interest);
      payment = principalPart + interest;
    } else {
      principalPart = Math.min(balance, linearPrincipal);
      payment = principalPart + interest;
    }
    balance = Math.max(0, balance - principalPart);
    cumulativeInterest += interest;
    months.push({
      month,
      year: Math.ceil(month / 12),
      payment,
      interest,
      principal: principalPart,
      balance,
      cumulativeInterest,
    });
  }

  const yearMap = new Map<number, ScheduleYear>();
  for (const row of months) {
    const existing = yearMap.get(row.year);
    if (!existing) {
      yearMap.set(row.year, {
        year: row.year,
        payment: row.payment,
        interest: row.interest,
        principal: row.principal,
        balanceEnd: row.balance,
        cumulativeInterest: row.cumulativeInterest,
      });
    } else {
      existing.payment += row.payment;
      existing.interest += row.interest;
      existing.principal += row.principal;
      existing.balanceEnd = row.balance;
      existing.cumulativeInterest = row.cumulativeInterest;
    }
  }

  const yearsRows = [...yearMap.values()];
  return {
    repayment,
    principal,
    annualRatePercent,
    months,
    years: yearsRows,
    totalInterest: cumulativeInterest,
    firstPayment: months[0]?.payment ?? 0,
    lastPayment: months[months.length - 1]?.payment ?? 0,
  };
}

export function rateImpactRows(
  principal: number,
  baseRatePercent: number,
  repayment: RepaymentType,
  deltas = [-1, -0.5, 0, 0.5, 1],
) {
  return deltas.map((delta) => {
    const rate = Math.max(0, Math.round((baseRatePercent + delta) * 100) / 100);
    const schedule = buildMortgageSchedule(principal, rate, repayment);
    return {
      rate,
      delta,
      firstPayment: schedule.firstPayment,
      totalInterest: schedule.totalInterest,
    };
  });
}
