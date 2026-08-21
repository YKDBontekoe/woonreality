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

export function normalizeRegionCode(code: string | undefined | null) {
  const trimmed = code?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
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

export async function pageCbsOData<T>(
  datasetUrl: string,
  filter: string,
  pageSize = 300,
): Promise<T[]> {
  const rows: T[] = [];
  let skip = 0;
  while (true) {
    const params = new URLSearchParams({
      $filter: filter,
      $top: String(pageSize),
      $skip: String(skip),
      $format: "json",
    });
    const response = await fetch(`${datasetUrl}/TypedDataSet?${params}`, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(`CBS OData ${response.status}`);
    const payload = await response.json() as { value?: T[] };
    const batch = payload.value ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    skip += pageSize;
  }
  return rows;
}
