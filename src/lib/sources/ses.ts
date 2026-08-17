import { cbsODataEq, cbsODataRegionVariants, latestCbsPeriodKey, periodYearLabel } from "@/src/lib/sources/cbs-odata";

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

async function fetchSesRows(regionCode: string): Promise<SesRow[]> {
  const rows: SesRow[] = [];
  for (const variant of cbsODataRegionVariants(regionCode)) {
    const params = new URLSearchParams({
      $filter: cbsODataEq("WijkenEnBuurten", variant),
      $format: "json",
    });
    const response = await fetch(`${sesStatLineUrl}/TypedDataSet?${params}`, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error(`CBS SES-WOA ${response.status}`);
    const payload = await response.json() as { value?: SesRow[] };
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
