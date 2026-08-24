import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { threeYearToetsinkomen } from "@/src/lib/mortgage/income";
import type { YearTriple } from "@/src/lib/mortgage/types";

/** Wettelijk minimum vakantiebijslag, art. 15 Wet minimumloon. */
export const HOLIDAY_PAY_RATE = 0.08;

export type HolidayMode = "standard" | "included" | "custom";
export type IncomeEntry = "monthly" | "annual";

export type SalaryBreakdownInput = {
  monthlyGross: number;
  holidayMode: HolidayMode;
  holidayCustom: number;
  thirteenthMonth: number;
  hasThirteenth: boolean;
  yearEndPayout: number;
  monthlyAllowances: number;
  structuralBonus: number;
  variableBonus: YearTriple;
};

export type SalaryLine = {
  key: string;
  label: string;
  amount: number;
};

export type SalaryBreakdown = {
  months: number;
  holiday: number;
  allowances: number;
  thirteenthMonth: number;
  yearEndPayout: number;
  structuralBonus: number;
  variableBonus: number;
  grossAnnual: number;
  extras: number;
  toetsinkomen: number;
  lines: SalaryLine[];
};

function roundEuro(value: number) {
  return Math.round(Math.max(0, value));
}

export function emptySalaryBreakdown(): SalaryBreakdownInput {
  return {
    monthlyGross: 0,
    holidayMode: "standard",
    holidayCustom: 0,
    thirteenthMonth: 0,
    hasThirteenth: false,
    yearEndPayout: 0,
    monthlyAllowances: 0,
    structuralBonus: 0,
    variableBonus: [0, 0, 0],
  };
}

export function holidayPayAmount(input: Pick<SalaryBreakdownInput, "monthlyGross" | "holidayMode" | "holidayCustom">) {
  const months = roundEuro(input.monthlyGross * 12);
  if (input.holidayMode === "included") return 0;
  if (input.holidayMode === "custom") return roundEuro(input.holidayCustom);
  return roundEuro(months * HOLIDAY_PAY_RATE);
}

export function thirteenthAmount(input: Pick<SalaryBreakdownInput, "monthlyGross" | "thirteenthMonth" | "hasThirteenth">) {
  if (!input.hasThirteenth) return 0;
  return roundEuro(input.thirteenthMonth || input.monthlyGross);
}

export function buildSalaryBreakdown(input: SalaryBreakdownInput, locale: Locale = "nl"): SalaryBreakdown {
  const t = getLibTranslator(locale, "lib-finance");
  const months = roundEuro(input.monthlyGross * 12);
  const holiday = holidayPayAmount(input);
  const allowances = roundEuro(input.monthlyAllowances * 12);
  const thirteenthMonth = thirteenthAmount(input);
  const yearEndPayout = roundEuro(input.yearEndPayout);
  const structuralBonus = roundEuro(input.structuralBonus);
  const variableBonus = roundEuro(threeYearToetsinkomen(input.variableBonus));
  const grossAnnual = months + holiday + allowances;
  const extras = thirteenthMonth + yearEndPayout + structuralBonus + variableBonus;
  const lines: SalaryLine[] = [];
  if (months) lines.push({ key: "months", label: t("mortgage.salary.months"), amount: months });
  if (holiday) {
    lines.push({
      key: "holiday",
      label: input.holidayMode === "custom" ? t("mortgage.salary.holiday") : t("mortgage.salary.holidayRate"),
      amount: holiday,
    });
  }
  if (allowances) lines.push({ key: "allowances", label: t("mortgage.salary.allowances"), amount: allowances });
  if (thirteenthMonth) lines.push({ key: "thirteenth", label: t("mortgage.salary.thirteenth"), amount: thirteenthMonth });
  if (yearEndPayout) lines.push({ key: "year-end", label: t("mortgage.salary.yearEnd"), amount: yearEndPayout });
  if (structuralBonus) lines.push({ key: "bonus", label: t("mortgage.salary.structuralBonus"), amount: structuralBonus });
  if (variableBonus) lines.push({ key: "variable", label: t("mortgage.salary.variableBonus"), amount: variableBonus });
  return {
    months,
    holiday,
    allowances,
    thirteenthMonth,
    yearEndPayout,
    structuralBonus,
    variableBonus,
    grossAnnual,
    extras,
    toetsinkomen: grossAnnual + extras,
    lines,
  };
}
