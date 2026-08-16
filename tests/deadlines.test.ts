import assert from "node:assert/strict";
import test from "node:test";
import { computeBedenktijdEnd, computeConditionDeadline, computePurchaseDeadlines, daysUntil, dutchPublicHolidays } from "../src/lib/deadlines";

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("bedenktijd received on a Wednesday runs to the following Monday", () => {
  // Wednesday 2026-01-07
  const end = computeBedenktijdEnd(new Date(2026, 0, 7));
  assert.equal(ymd(end), "2026-01-12");
});

test("bedenktijd received on a Thursday still needs two werkdagen, so it extends into the next week", () => {
  // Thursday 2026-01-08
  const end = computeBedenktijdEnd(new Date(2026, 0, 8));
  assert.equal(ymd(end), "2026-01-12");
});

test("bedenktijd received on a Monday stays within the same week when three werkdagen already fit", () => {
  // Monday 2026-01-05 -> +3 calendar days = Thursday, which already contains 3 werkdagen
  const end = computeBedenktijdEnd(new Date(2026, 0, 5));
  assert.equal(ymd(end), "2026-01-08");
});

test("bedenktijd shifts past a public holiday that would otherwise count as a werkdag", () => {
  // Nieuwjaarsdag 2026-01-01 is a Thursday; receiving on 2025-12-29 (Monday) means
  // Wed 2025-12-31 is a werkdag, Thu 2026-01-01 is a holiday, so the window needs to extend.
  const end = computeBedenktijdEnd(new Date(2025, 11, 29));
  assert.ok(end.getTime() > new Date(2026, 0, 1).getTime());
});

test("condition deadline adds whole weeks with no werkdagen correction", () => {
  const signed = new Date(2026, 2, 2); // Monday 2026-03-02
  const deadline = computeConditionDeadline(signed, 6);
  assert.equal(ymd(deadline), "2026-04-13");
});

test("computePurchaseDeadlines always includes bedenktijd and adds conditions only when weeks are given", () => {
  const signed = new Date(2026, 2, 2);
  const onlyBedenktijd = computePurchaseDeadlines({ contractSignedAt: signed });
  assert.equal(onlyBedenktijd.length, 1);
  assert.equal(onlyBedenktijd[0].key, "bedenktijd");

  const withConditions = computePurchaseDeadlines({ contractSignedAt: signed, financingWeeks: 6, inspectionWeeks: 2 });
  assert.equal(withConditions.length, 3);
  assert.deepEqual(withConditions.map((item) => item.key), ["bedenktijd", "financing", "inspection"]);
});

test("daysUntil counts whole calendar days regardless of time of day", () => {
  const from = new Date(2026, 0, 1, 23, 30);
  const target = new Date(2026, 0, 4, 0, 5);
  assert.equal(daysUntil(target, from), 3);
});

test("dutch public holidays include Koningsdag shifted off a Sunday", () => {
  // 27 April 2025 is a Sunday, so Koningsdag should shift to 26 April.
  const holidays2025 = dutchPublicHolidays(2025);
  assert.ok(holidays2025.some((date) => date.getMonth() === 3 && date.getDate() === 26));
  assert.ok(!holidays2025.some((date) => date.getMonth() === 3 && date.getDate() === 27));
  const holidays2026 = dutchPublicHolidays(2026);
  assert.ok(holidays2026.some((date) => date.getMonth() === 3 && date.getDate() === 27));
});
