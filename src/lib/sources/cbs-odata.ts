import { fetchJson } from "@/src/lib/http/fetch-json";

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

export function assertPositiveInteger(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new RangeError(`${label} must be a positive integer`);
  }
  return value;
}

export async function pageCbsOData<T>(
  datasetUrl: string,
  filter: string,
  pageSize = 300,
): Promise<T[]> {
  const limit = assertPositiveInteger(pageSize, "pageSize");
  const rows: T[] = [];
  let skip = 0;
  while (true) {
    const params = new URLSearchParams({
      $filter: filter,
      $top: String(limit),
      $skip: String(skip),
      $format: "json",
    });
    const payload = await fetchJson<{ value?: T[] }>(`${datasetUrl}/TypedDataSet?${params}`, "CBS OData", { revalidate: 86400, timeoutMs: 20_000 });
    const batch = payload.value ?? [];
    rows.push(...batch);
    if (batch.length < limit) break;
    skip += limit;
  }
  return rows;
}
