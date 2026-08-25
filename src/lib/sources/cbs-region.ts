import { cbsODataEq, cbsODataRegionVariants } from "@/src/lib/sources/cbs-odata";
import { fetchJson } from "@/src/lib/http/fetch-json";

export type SpatialScale = "buurt" | "wijk" | "gemeente";

/** CBS region keys are prefixed with their spatial scale (BU/WK/gm…). */
export function spatialScaleFromCode(code: string): SpatialScale {
  if (code.startsWith("BU")) return "buurt";
  if (code.startsWith("WK")) return "wijk";
  return "gemeente";
}

export type RegionScaleCodes = {
  buurtcode?: string;
  wijkcode?: string;
  gemeentecode?: string;
};

/** Candidate lookups ordered finest-first; callers prefer the first hit. */
export function regionCandidates(codes: RegionScaleCodes): { code: string; spatialScale: SpatialScale }[] {
  return [
    ...(codes.buurtcode ? [{ code: codes.buurtcode, spatialScale: "buurt" as const }] : []),
    ...(codes.wijkcode ? [{ code: codes.wijkcode, spatialScale: "wijk" as const }] : []),
    ...(codes.gemeentecode ? [{ code: codes.gemeentecode, spatialScale: "gemeente" as const }] : []),
  ];
}

/**
 * One request covers both the raw and right-padded key variants instead of
 * probing them sequentially. The region clause is parenthesized so an optional
 * `extraFilter` cannot change its meaning under OData's `and`-over-`or`
 * precedence.
 */
export async function fetchCbsRegionRows<Row>(
  datasetUrl: string,
  label: string,
  regionCode: string,
  options: { extraFilter?: string; revalidate?: number; timeoutMs?: number } = {},
): Promise<Row[]> {
  const variants = cbsODataRegionVariants(regionCode);
  if (!variants.length) return [];
  const regionFilter = `(${variants.map((variant) => cbsODataEq("WijkenEnBuurten", variant)).join(" or ")})`;
  const filter = options.extraFilter ? `${regionFilter} and (${options.extraFilter})` : regionFilter;
  const params = new URLSearchParams({
    $filter: filter,
    $format: "json",
  });
  const payload = await fetchJson<{ value?: Row[] }>(
    `${datasetUrl}/TypedDataSet?${params}`,
    label,
    { revalidate: options.revalidate ?? 86400, ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}) },
  );
  return payload.value ?? [];
}
