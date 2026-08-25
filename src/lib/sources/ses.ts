import type { SourceContextBase } from "@/src/lib/source-context";
import { assertPositiveInteger, latestCbsPeriodKey, normalizeRegionCode, periodYearLabel } from "@/src/lib/sources/cbs-odata";
import { fetchCbsRegionRows, regionCandidates, spatialScaleFromCode, type RegionScaleCodes } from "@/src/lib/sources/cbs-region";
import { createInflightDeduper, createTtlCache, runPool } from "@/src/lib/cache/ttl";

export const sesStatLineUrl = "https://opendata.cbs.nl/ODataApi/OData/86296NED";
export const sesStatLineTableUrl = "https://opendata.cbs.nl/#/CBS/nl/dataset/86296NED";

export type SesContext = SourceContextBase & {
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
const sesLookupCache = createTtlCache<SesLookupEntry>({ ttlMs: SES_LOOKUP_TTL_MS });
const dedupeSesLookup = createInflightDeduper<SesLookupEntry | undefined>();

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
  if (cached) return cached;
  return dedupeSesLookup(normalized, async () => {
    const rows = await fetchSesRows(normalized);
    const parsed = parseSesRows(rows, normalized, spatialScaleFromCode(normalized));
    if (!parsed) return undefined;
    const value = sesEntryFromContext(parsed);
    sesLookupCache.set(normalized, value);
    return value;
  });
}

export async function preloadSesEntries(regionCodes: string[], concurrency = 12) {
  assertPositiveInteger(concurrency, "concurrency");
  const queue = [...new Set(regionCodes.map((code) => normalizeRegionCode(code)).filter(Boolean))] as string[];
  await runPool(queue, (code) => fetchSesEntry(code).catch(() => undefined), concurrency);
}

export function lookupSesEntry(lookup: Map<string, SesLookupEntry>, regionCode: string | undefined) {
  const normalized = normalizeRegionCode(regionCode);
  if (!normalized) return undefined;
  return lookup.get(normalized) ?? sesLookupCache.get(normalized);
}

export async function getSesLookupForCodes(regionCodes: string[]) {
  await preloadSesEntries(regionCodes);
  const lookup = new Map<string, SesLookupEntry>();
  for (const code of regionCodes) {
    const normalized = normalizeRegionCode(code);
    if (!normalized) continue;
    const entry = sesLookupCache.get(normalized);
    if (entry) lookup.set(normalized, entry);
  }
  const periodYear = [...lookup.values()].find((entry) => entry.periodYear)?.periodYear;
  return { lookup, periodYear };
}

async function fetchSesRows(regionCode: string): Promise<SesRow[]> {
  return fetchCbsRegionRows<SesRow>(sesStatLineUrl, "CBS SES-WOA", regionCode);
}

export async function getSesContext(codes: RegionScaleCodes): Promise<SesContext | null> {
  const candidates = regionCandidates(codes);
  const fetchedAt = new Date().toISOString();
  // Fetch all candidate scales in parallel, then prefer the finest scale with
  // data instead of paying a serial round trip per fallback level.
  const parsed = await Promise.all(candidates.map(async (candidate) => (
    parseSesRows(await fetchSesRows(candidate.code), candidate.code, candidate.spatialScale, fetchedAt)
  )));
  return parsed.find((context) => context) ?? null;
}
