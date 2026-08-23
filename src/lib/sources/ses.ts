import { cbsODataEq, cbsODataRegionVariants, latestCbsPeriodKey, normalizeRegionCode, periodYearLabel, assertPositiveInteger } from "@/src/lib/sources/cbs-odata";
import { fetchJson } from "@/src/lib/http/fetch-json";

export const sesStatLineUrl = "https://opendata.cbs.nl/ODataApi/OData/86296NED";
export const sesStatLineTableUrl = "https://opendata.cbs.nl/#/CBS/nl/dataset/86296NED";

export type SesContext = {
  regionCode: string;
  spatialScale: "buurt" | "wijk" | "gemeente";
  period: string;
  periodYear?: string;
  sesScore?: number;
  wealthScore?: number;
  educationScore?: number;
  workScore?: number;
  educationLowPct?: number;
  educationMidPct?: number;
  educationHighPct?: number;
  fetchedAt: string;
};

type SesRow = {
  WijkenEnBuurten?: string;
  Perioden?: string;
  GemiddeldeScore_29?: number | null;
  GemiddeldeScore_31?: number | null;
  GemiddeldeScore_33?: number | null;
  GemiddeldeScore_35?: number | null;
  Waarde_16?: number | null;
  Waarde_19?: number | null;
  Waarde_22?: number | null;
};

function readScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseSesRows(rows: SesRow[], regionCode: string, spatialScale: SesContext["spatialScale"], fetchedAt = new Date().toISOString()): SesContext | null {
  const period = latestCbsPeriodKey(rows.map((row) => row.Perioden ?? ""));
  if (!period) return null;
  const row = rows.find((item) => (item.Perioden ?? "").trim() === period);
  if (!row) return null;
  const sesScore = readScore(row.GemiddeldeScore_29);
  const educationLowPct = readScore(row.Waarde_16);
  const educationMidPct = readScore(row.Waarde_19);
  const educationHighPct = readScore(row.Waarde_22);
  if (sesScore == null && educationLowPct == null && educationMidPct == null && educationHighPct == null) return null;
  return {
    regionCode,
    spatialScale,
    period,
    periodYear: periodYearLabel(period),
    sesScore,
    wealthScore: readScore(row.GemiddeldeScore_31),
    educationScore: readScore(row.GemiddeldeScore_33),
    workScore: readScore(row.GemiddeldeScore_35),
    educationLowPct,
    educationMidPct,
    educationHighPct,
    fetchedAt,
  };
}

export type SesLookupEntry = {
  sesScore?: number;
  wealthScore?: number;
  educationScore?: number;
  workScore?: number;
  educationLowPct?: number;
  educationMidPct?: number;
  educationHighPct?: number;
  periodYear?: string;
};

const SES_LOOKUP_TTL_MS = 6 * 60 * 60 * 1000;
const sesLookupCache = new Map<string, { value: SesLookupEntry; expiresAt: number }>();
const sesLookupInflight = new Map<string, Promise<SesLookupEntry | undefined>>();

function spatialScaleFromCode(code: string): SesContext["spatialScale"] {
  if (code.startsWith("BU")) return "buurt";
  if (code.startsWith("WK")) return "wijk";
  return "gemeente";
}

function sesEntryFromContext(context: SesContext): SesLookupEntry {
  return {
    sesScore: context.sesScore,
    wealthScore: context.wealthScore,
    educationScore: context.educationScore,
    workScore: context.workScore,
    educationLowPct: context.educationLowPct,
    educationMidPct: context.educationMidPct,
    educationHighPct: context.educationHighPct,
    periodYear: context.periodYear,
  };
}

async function fetchSesEntry(regionCode: string): Promise<SesLookupEntry | undefined> {
  const normalized = normalizeRegionCode(regionCode);
  if (!normalized) return undefined;
  const cached = sesLookupCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const inflight = sesLookupInflight.get(normalized);
  if (inflight) return inflight;

  const promise = (async () => {
    for (const variant of cbsODataRegionVariants(normalized)) {
      const rows = await fetchSesRows(variant);
      const parsed = parseSesRows(rows, variant, spatialScaleFromCode(normalized));
      if (parsed) {
        const value = sesEntryFromContext(parsed);
        sesLookupCache.set(normalized, { value, expiresAt: Date.now() + SES_LOOKUP_TTL_MS });
        return value;
      }
    }
    return undefined;
  })().finally(() => { sesLookupInflight.delete(normalized); });

  sesLookupInflight.set(normalized, promise);
  return promise;
}

export async function preloadSesEntries(regionCodes: string[], concurrency = 12) {
  const batchSize = assertPositiveInteger(concurrency, "concurrency");
  const unique = [...new Set(regionCodes.map((code) => normalizeRegionCode(code)).filter(Boolean))] as string[];
  for (let index = 0; index < unique.length; index += batchSize) {
    await Promise.all(unique.slice(index, index + batchSize).map((code) => fetchSesEntry(code).catch(() => undefined)));
  }
}

export function lookupSesEntry(lookup: Map<string, SesLookupEntry>, regionCode: string | undefined) {
  const normalized = normalizeRegionCode(regionCode);
  if (!normalized) return undefined;
  return lookup.get(normalized) ?? sesLookupCache.get(normalized)?.value;
}

export async function getSesLookupForCodes(regionCodes: string[]) {
  await preloadSesEntries(regionCodes);
  const lookup = new Map<string, SesLookupEntry>();
  for (const code of regionCodes) {
    const normalized = normalizeRegionCode(code);
    if (!normalized) continue;
    const entry = sesLookupCache.get(normalized)?.value;
    if (entry) lookup.set(normalized, entry);
  }
  const periodYear = [...lookup.values()].find((entry) => entry.periodYear)?.periodYear;
  return { lookup, periodYear };
}

async function fetchSesRows(regionCode: string): Promise<SesRow[]> {
  const rows: SesRow[] = [];
  for (const variant of cbsODataRegionVariants(regionCode)) {
    const params = new URLSearchParams({
      $filter: cbsODataEq("WijkenEnBuurten", variant),
      $format: "json",
    });
    const payload = await fetchJson<{ value?: SesRow[] }>(`${sesStatLineUrl}/TypedDataSet?${params}`, "CBS SES-WOA", { revalidate: 86400 });
    if (payload.value?.length) {
      rows.push(...payload.value);
      break;
    }
  }
  return rows;
}

export async function getSesContext(codes: { buurtcode?: string; wijkcode?: string; gemeentecode?: string }): Promise<SesContext | null> {
  const candidates: { code: string; spatialScale: SesContext["spatialScale"] }[] = [
    ...(codes.buurtcode ? [{ code: codes.buurtcode, spatialScale: "buurt" as const }] : []),
    ...(codes.wijkcode ? [{ code: codes.wijkcode, spatialScale: "wijk" as const }] : []),
    ...(codes.gemeentecode ? [{ code: codes.gemeentecode, spatialScale: "gemeente" as const }] : []),
  ];
  const fetchedAt = new Date().toISOString();
  for (const candidate of candidates) {
    const rows = await fetchSesRows(candidate.code);
    const parsed = parseSesRows(rows, candidate.code, candidate.spatialScale, fetchedAt);
    if (parsed) return parsed;
  }
  return null;
}
