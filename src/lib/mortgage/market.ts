/**
 * Live marktdata voor de hypotheekcheck.
 * - AFM: kwartaaltoetsrente (officiële publicatie, rentevast < 10 jaar).
 * - ECB/DNB MIR: nieuwe-contractenrente Nederlandse woninghypotheken (laatste punt + historie).
 * Woonquotes, NHG-grenzen en energietoeslagen blijven jaarlijks in reference.ts (wet/NHG), niet live.
 */
import { AFM_TOETSRENTE_FLOOR, INDICATIVE_RATES, indicativeRate } from "@/src/lib/mortgage/norms-2026";
import type { FixedPeriodYears, MortgageMarketHistorySeries, MortgageMarketRatePoint, MortgageMarketSnapshot } from "@/src/lib/mortgage/types";

export const AFM_TOETSRENTE_URL = "https://www.afm.nl/nl-nl/sector/themas/dienstverlening-aan-consumenten/financiele-producten/hypothecair-krediet";
export const ECB_MIR_URL = "https://data-api.ecb.europa.eu/service/data/MIR";
/** NHG vs non-NHG zit niet in ECB/DNB; dit is een gedocumenteerde indicatieve spread, geen bankofferte. */
export const NHG_RATE_OFFSET = 0.2;
/** ~5 jaar maandcijfers voor de historische rentegrafiek. */
export const ECB_HISTORY_OBSERVATIONS = 60;

const ECB_SERIES: Record<FixedPeriodYears, string> = {
  5: "M.NL.B.A2C.I.R.A.2250.EUR.N",
  10: "M.NL.B.A2C.O.R.A.2250.EUR.N",
  20: "M.NL.B.A2C.P.R.A.2250.EUR.N",
  30: "M.NL.B.A2C.P.R.A.2250.EUR.N",
};

const FETCH_TIMEOUT_MS = 8_000;
const FETCH_HEADERS = {
  Accept: "application/json, text/html",
  "User-Agent": "WoonReality/0.1 (mortgage-norms; +https://github.com/YKDBontekoe/woonreality)",
};

export function parseAfmToetsrente(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
  const match = text.match(/toetsrente voor het ([^.,]+?) kwartaal van (\d{4}) bedraagt (\d+(?:[.,]\d+)?)\s*%/i);
  if (!match) return null;
  const rate = Number(match[3].replace(",", "."));
  if (!Number.isFinite(rate) || rate < 3 || rate > 12) return null;
  return { rate, label: `${match[1].trim()} kwartaal ${match[2]}`, year: Number(match[2]) };
}

export function marketIndicativeRate(market: MortgageMarketSnapshot | null | undefined, period: FixedPeriodYears, nhg: boolean) {
  const live = market?.indicativeRates.byPeriod[period];
  if (market?.indicativeRates.live && live) return nhg ? live.nhg : live.other;
  return indicativeRate(period, nhg);
}

type EcbPayload = {
  dataSets?: { series?: Record<string, { observations?: Record<string, [number, ...unknown[]]> }> }[];
  structure?: { dimensions?: { observation?: { values?: { id?: string }[] }[] } };
};

export function parseEcbMirSeries(payload: unknown): MortgageMarketRatePoint[] | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as EcbPayload;
  const series = record.dataSets?.[0]?.series;
  if (!series) return null;
  const first = Object.values(series)[0];
  const observations = first?.observations;
  if (!observations) return null;
  const periods = record.structure?.dimensions?.observation?.[0]?.values ?? [];
  const points: MortgageMarketRatePoint[] = [];
  for (const [index, observation] of Object.entries(observations)) {
    const value = observation?.[0];
    const period = periods[Number(index)]?.id ?? "";
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 20) continue;
    if (!period) continue;
    points.push({ month: period, rate: Math.round(value * 100) / 100 });
  }
  points.sort((a, b) => a.month.localeCompare(b.month));
  return points.length > 0 ? points : null;
}

/** Latest observation only — used by health checks and callers that need a single point. */
export function parseEcbMirObservation(payload: unknown) {
  const series = parseEcbMirSeries(payload);
  if (!series || series.length === 0) return null;
  const last = series[series.length - 1];
  return { rate: last.rate, period: last.month };
}

function fallbackSnapshot(): MortgageMarketSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    toetsrente: {
      rate: AFM_TOETSRENTE_FLOOR,
      label: "wettelijk minimum 5%",
      sourceUrl: AFM_TOETSRENTE_URL,
      live: false,
    },
    indicativeRates: {
      asOf: INDICATIVE_RATES.asOf,
      source: "ingebouwde indicatie",
      sourceUrl: "https://data.ecb.europa.eu/data/datasets/MIR",
      live: false,
      byPeriod: {
        5: { nhg: indicativeRate(5, true), other: indicativeRate(5, false) },
        10: { nhg: indicativeRate(10, true), other: indicativeRate(10, false) },
        20: { nhg: indicativeRate(20, true), other: indicativeRate(20, false) },
        30: { nhg: indicativeRate(30, true), other: indicativeRate(30, false) },
      },
    },
    history: [],
  };
}

async function fetchAfmToetsrente() {
  const response = await fetch(AFM_TOETSRENTE_URL, {
    headers: FETCH_HEADERS,
    next: { revalidate: 21_600 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`AFM HTTP ${response.status}`);
  const parsed = parseAfmToetsrente(await response.text());
  if (!parsed) throw new Error("AFM toetsrente kon niet worden gelezen");
  return parsed;
}

async function fetchEcbSeries(period: FixedPeriodYears) {
  const url = `${ECB_MIR_URL}/${ECB_SERIES[period]}?lastNObservations=${ECB_HISTORY_OBSERVATIONS}&format=jsondata`;
  const response = await fetch(url, {
    headers: { ...FETCH_HEADERS, Accept: "application/json" },
    next: { revalidate: 86_400 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`ECB HTTP ${response.status}`);
  const points = parseEcbMirSeries(await response.json());
  if (!points || points.length === 0) throw new Error("ECB-rente kon niet worden gelezen");
  const last = points[points.length - 1];
  return { rate: last.rate, period: last.month, points };
}

function asIndicativeRate(value: number, nhg: boolean) {
  return Math.round((nhg ? Math.max(0, value - NHG_RATE_OFFSET) : value) * 100) / 100;
}

function bandFromResult(
  result: PromiseSettledResult<{ rate: number; period: string; points: MortgageMarketRatePoint[] }>,
  fallback: { nhg: number; other: number },
) {
  if (result.status !== "fulfilled") return fallback;
  return { nhg: asIndicativeRate(result.value.rate, true), other: asIndicativeRate(result.value.rate, false) };
}

function historyFromResult(
  period: FixedPeriodYears,
  result: PromiseSettledResult<{ rate: number; period: string; points: MortgageMarketRatePoint[] }>,
): MortgageMarketHistorySeries | null {
  if (result.status !== "fulfilled") return null;
  return { period, points: result.value.points };
}

export async function loadMortgageMarket(): Promise<MortgageMarketSnapshot> {
  const snapshot = fallbackSnapshot();
  const [afm, five, ten, long] = await Promise.allSettled([
    fetchAfmToetsrente(),
    fetchEcbSeries(5),
    fetchEcbSeries(10),
    fetchEcbSeries(20),
  ]);
  if (afm.status === "fulfilled") {
    snapshot.toetsrente = {
      rate: Math.max(AFM_TOETSRENTE_FLOOR, afm.value.rate),
      label: afm.value.label,
      sourceUrl: AFM_TOETSRENTE_URL,
      live: true,
    };
  }
  if (five.status === "fulfilled" || ten.status === "fulfilled" || long.status === "fulfilled") {
    const fallbackBands = snapshot.indicativeRates.byPeriod;
    const asOf = (ten.status === "fulfilled" && ten.value.period)
      || (five.status === "fulfilled" && five.value.period)
      || (long.status === "fulfilled" && long.value.period)
      || snapshot.indicativeRates.asOf;
    snapshot.indicativeRates = {
      asOf,
      source: "DNB/ECB nieuwe woninghypotheken (banken)",
      sourceUrl: "https://data.ecb.europa.eu/data/datasets/MIR/MIR.M.NL.B.A2C.O.R.A.2250.EUR.N",
      live: true,
      byPeriod: {
        5: bandFromResult(five, fallbackBands[5]),
        10: bandFromResult(ten, fallbackBands[10]),
        20: bandFromResult(long, fallbackBands[20]),
        30: bandFromResult(long, fallbackBands[30]),
      },
    };
    const history: MortgageMarketHistorySeries[] = [];
    const fiveHistory = historyFromResult(5, five);
    const tenHistory = historyFromResult(10, ten);
    const longHistory = historyFromResult(20, long);
    if (fiveHistory) history.push(fiveHistory);
    if (tenHistory) history.push(tenHistory);
    if (longHistory) {
      history.push(longHistory);
      history.push({ period: 30, points: longHistory.points });
    }
    snapshot.history = history;
  }
  return snapshot;
}
