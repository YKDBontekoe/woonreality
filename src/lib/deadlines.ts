import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

/**
 * Pure date-math helpers for the legal/contractual deadlines that a Dutch
 * aankoopmakelaar would normally track for you: bedenktijd (Art. 7:2 BW) and
 * the negotiated ontbindende voorwaarden (financiering, bouwkundige keuring).
 *
 * Everything here is deterministic and side-effect free so it can be unit
 * tested without mocking dates, and reused both server-side (task sync) and
 * client-side (showing a countdown).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Inclusive end of the local calendar day — deadlines remain valid until this instant. */
function atEndOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  return new Date(atMidnight(date).getTime() + days * DAY_MS);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Gauss's algorithm for the (Gregorian) date of Easter Sunday. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Dutch national public holidays that fall on a weekday and are commonly
 * treated as non-werkdagen for legal-term purposes (Koningsdag, Bevrijdingsdag
 * and the Christian holidays derived from Easter). This is a practical
 * approximation, not an exhaustive legal list — always confirm against the
 * actual koopovereenkomst and notary planning for a real transaction.
 */
export function dutchPublicHolidays(year: number): Date[] {
  const easter = easterSunday(year);
  return [
    new Date(year, 0, 1), // Nieuwjaarsdag
    addDays(easter, -2), // Goede Vrijdag (bank holiday in practice)
    addDays(easter, 1), // Tweede Paasdag
    new Date(year, 3, 27), // Koningsdag (27 april; verschuift naar 26 als op zondag)
    new Date(year, 4, 5), // Bevrijdingsdag
    addDays(easter, 39), // Hemelvaartsdag
    addDays(easter, 50), // Tweede Pinksterdag
    new Date(year, 11, 25), // Eerste Kerstdag
    new Date(year, 11, 26), // Tweede Kerstdag
  ].map((date) => {
    if (date.getMonth() === 3 && date.getDate() === 27 && date.getDay() === 0) {
      return new Date(year, 3, 26);
    }
    return date;
  });
}

function isDutchHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some((holiday) => holiday.getFullYear() === date.getFullYear() && holiday.getMonth() === date.getMonth() && holiday.getDate() === date.getDate());
}

function isWerkdag(date: Date, holidays: Date[]): boolean {
  return !isWeekend(date) && !isDutchHoliday(date, holidays);
}

/**
 * Bedenktijd (Art. 7:2 BW): minimaal drie kalenderdagen, waarvan minimaal
 * twee werkdagen, te rekenen vanaf de dag ná ontvangst van de door beide
 * partijen ondertekende koopovereenkomst. Valt de derde dag in het weekend of
 * op een feestdag, dan loopt de termijn door tot de eerstvolgende werkdag.
 *
 * Returns the last day (inclusive, at end of day) on which the buyer can
 * still ontbinden zonder opgaaf van reden.
 */
export function computeBedenktijdEnd(contractReceivedAt: Date): Date {
  const receivedYear = contractReceivedAt.getFullYear();
  const holidays = [...dutchPublicHolidays(receivedYear), ...dutchPublicHolidays(receivedYear + 1)];
  let candidate = addDays(contractReceivedAt, 3);
  // Guarantee at least two werkdagen fall within [dag na ontvangst, candidate].
  for (;;) {
    let werkdagen = 0;
    for (let cursor = addDays(contractReceivedAt, 1); cursor.getTime() <= candidate.getTime(); cursor = addDays(cursor, 1)) {
      if (isWerkdag(cursor, holidays)) werkdagen += 1;
    }
    if (werkdagen >= 2) break;
    candidate = addDays(candidate, 1);
  }
  // If the (already werkdag-corrected) end date itself falls on a
  // weekend/feestdag, common notary practice extends it to the next werkdag.
  while (!isWerkdag(candidate, holidays)) {
    candidate = addDays(candidate, 1);
  }
  return atEndOfDay(candidate);
}

/**
 * Ontbindende voorwaarden (financiering, bouwkundige keuring, NHG) hebben
 * geen wettelijke termijn — die staat in de koopovereenkomst, doorgaans in
 * hele weken vanaf de datum waarop de laatste partij tekent. This is a plain
 * calendar calculation; no werkdagen-correctie van toepassing.
 */
export function computeConditionDeadline(contractSignedAt: Date, weeks: number): Date {
  return atEndOfDay(addDays(contractSignedAt, Math.max(0, Math.round(weeks)) * 7));
}

export function daysUntil(target: Date, from: Date = new Date()): number {
  return Math.ceil((atMidnight(target).getTime() - atMidnight(from).getTime()) / DAY_MS);
}

export type PurchaseDeadline = {
  key: "bedenktijd" | "financing" | "inspection";
  label: string;
  dueAt: Date;
};

export function computePurchaseDeadlines(input: {
  /** Receipt date of the signed koopovereenkomst — drives bedenktijd (Art. 7:2 BW). */
  contractReceivedAt?: Date | null;
  /** Signing date — drives ontbindende-voorwaarden deadlines. */
  contractSignedAt?: Date | null;
  financingWeeks?: number | null;
  inspectionWeeks?: number | null;
}, locale: Locale = "nl"): PurchaseDeadline[] {
  const t = getLibTranslator(locale, "lib-domain");
  const deadlines: PurchaseDeadline[] = [];
  const receivedAt = input.contractReceivedAt ?? input.contractSignedAt;
  if (receivedAt) {
    deadlines.push({ key: "bedenktijd", label: t("deadlines.bedenktijd"), dueAt: computeBedenktijdEnd(receivedAt) });
  }
  if (input.contractSignedAt && input.financingWeeks != null && input.financingWeeks > 0) {
    deadlines.push({ key: "financing", label: t("deadlines.financing"), dueAt: computeConditionDeadline(input.contractSignedAt, input.financingWeeks) });
  }
  if (input.contractSignedAt && input.inspectionWeeks != null && input.inspectionWeeks > 0) {
    deadlines.push({ key: "inspection", label: t("deadlines.inspection"), dueAt: computeConditionDeadline(input.contractSignedAt, input.inspectionWeeks) });
  }
  return deadlines;
}
