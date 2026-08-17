/** CBS StatLine / Politie OData region keys are often right-padded to 10 characters. */
export function cbsODataRegionVariants(code: string): string[] {
  const trimmed = code.trim();
  if (!trimmed) return [];
  const padded = trimmed.padEnd(10, " ");
  return padded === trimmed ? [trimmed] : [trimmed, padded];
}

export function cbsODataEq(field: string, value: string) {
  return `${field} eq '${value.replace(/'/g, "''")}'`;
}

export function latestCbsPeriodKey(keys: string[]): string | undefined {
  const trimmed = keys.map((key) => key.trim()).filter(Boolean);
  const yearly = trimmed.filter((key) => /^\d{4}(JJ\d{2})?$/.test(key));
  const pool = yearly.length ? yearly : trimmed;
  return [...pool].sort((a, b) => a.localeCompare(b)).at(-1);
}

export function periodYearLabel(period: string) {
  const year = period.trim().slice(0, 4);
  return /^\d{4}$/.test(year) ? year : period.trim();
}
