import { cbsODataEq, cbsODataRegionVariants, latestCbsPeriodKey, periodYearLabel } from "@/src/lib/sources/cbs-odata";

export const politieMisdrijvenUrl = "https://dataderden.cbs.nl/ODataApi/OData/47018NED";
export const politieMisdrijvenTableUrl = "https://data.politie.nl/#/Politie/nl/dataset/47018NED/table";

/** Approximate 2024 NL registered-crime rate (~812k / 18m inwoners). Used only as a scoring midpoint. */
export const NL_CRIME_PER_1000 = 45;

const CRIME_TYPES = {
  total: "0.0.0",
  burglary: "1.1.1",
  assault: "1.4.5",
} as const;

export type CrimeContext = {
  regionCode: string;
  spatialScale: "buurt" | "wijk" | "gemeente";
  period: string;
  periodYear?: string;
  total?: number;
  burglary?: number;
  assault?: number;
  per1000?: number;
  fetchedAt: string;
};

type CrimeRow = {
  SoortMisdrijf?: string;
  WijkenEnBuurten?: string;
  Perioden?: string;
  GeregistreerdeMisdrijven_1?: number | null;
};

function crimeTypeKey(value: string | undefined) {
  return (value ?? "").trim();
}

export function crimeRatePer1000(total: number | undefined, inhabitants: number | undefined) {
  if (total == null || inhabitants == null || inhabitants <= 0) return undefined;
  return Math.round((total / inhabitants) * 1000 * 10) / 10;
}

/** Lower registered crime per 1.000 inwoners scores higher. NL-typical ~45 → about 6.3. */
export function crimeScoreFromRatePer1000(rate: number) {
  return Math.round(Math.min(10, Math.max(0, 10 - rate / 12)) * 10) / 10;
}

export function parseCrimeRows(
  rows: CrimeRow[],
  regionCode: string,
  spatialScale: CrimeContext["spatialScale"],
  inhabitants?: number,
  fetchedAt = new Date().toISOString(),
): CrimeContext | null {
  const period = latestCbsPeriodKey(rows.map((row) => row.Perioden ?? ""));
  if (!period) return null;
  const latest = rows.filter((row) => (row.Perioden ?? "").trim() === period);
  const countFor = (type: string) => {
    const row = latest.find((item) => crimeTypeKey(item.SoortMisdrijf) === type);
    const value = row?.GeregistreerdeMisdrijven_1;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const total = countFor(CRIME_TYPES.total);
  const burglary = countFor(CRIME_TYPES.burglary);
  const assault = countFor(CRIME_TYPES.assault);
  if (total == null && burglary == null && assault == null) return null;
  return {
    regionCode,
    spatialScale,
    period,
    periodYear: periodYearLabel(period),
    total,
    burglary,
    assault,
    per1000: crimeRatePer1000(total, inhabitants),
    fetchedAt,
  };
}

function soortFilter() {
  return Object.values(CRIME_TYPES)
    .map((key) => cbsODataEq("SoortMisdrijf", `${key} `))
    .join(" or ");
}

async function fetchCrimeRows(regionCode: string): Promise<CrimeRow[]> {
  const rows: CrimeRow[] = [];
  for (const variant of cbsODataRegionVariants(regionCode)) {
    const params = new URLSearchParams({
      $filter: `${cbsODataEq("WijkenEnBuurten", variant)} and (${soortFilter()})`,
      $format: "json",
    });
    const response = await fetch(`${politieMisdrijvenUrl}/TypedDataSet?${params}`, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(`Politie misdrijven ${response.status}`);
    const payload = await response.json() as { value?: CrimeRow[] };
    if (payload.value?.length) {
      rows.push(...payload.value);
      break;
    }
  }
  return rows;
}

export async function getCrimeContext(codes: {
  buurtcode?: string;
  wijkcode?: string;
  gemeentecode?: string;
  inhabitants?: number;
}): Promise<CrimeContext | null> {
  const candidates: { code: string; spatialScale: CrimeContext["spatialScale"] }[] = [
    ...(codes.buurtcode ? [{ code: codes.buurtcode, spatialScale: "buurt" as const }] : []),
    ...(codes.wijkcode ? [{ code: codes.wijkcode, spatialScale: "wijk" as const }] : []),
    ...(codes.gemeentecode ? [{ code: codes.gemeentecode, spatialScale: "gemeente" as const }] : []),
  ];
  const fetchedAt = new Date().toISOString();
  for (const candidate of candidates) {
    const rows = await fetchCrimeRows(candidate.code);
    const parsed = parseCrimeRows(rows, candidate.code, candidate.spatialScale, codes.inhabitants, fetchedAt);
    if (parsed) return parsed;
  }
  return null;
}
