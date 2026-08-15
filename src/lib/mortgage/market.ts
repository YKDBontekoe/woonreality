/**
 * Live marktdata voor de hypotheekcheck.
 * - AFM: kwartaaltoetsrente (officiële publicatie, rentevast < 10 jaar).
 * - ECB/DNB MIR: nieuwe-contractenrente Nederlandse woninghypotheken.
 * Woonquotes, NHG-grenzen en energietoeslagen blijven jaarlijks in de repo (wet/NHG), niet live.
 */
import { AFM_TOETSRENTE_FLOOR, INDICATIVE_RATES, indicativeRate } from "@/src/lib/mortgage/norms-2026";
import type { FixedPeriodYears, MortgageMarketSnapshot } from "@/src/lib/mortgage/types";

export const AFM_TOETSRENTE_URL = "https://www.afm.nl/nl-nl/sector/themas/dienstverlening-aan-consumenten/financiele-producten/hypothecair-krediet";
export const ECB_MIR_URL = "https://data-api.ecb.europa.eu/service/data/MIR";
/** NHG vs non-NHG zit niet in ECB/DNB; dit is een gedocumenteerde indicatieve spread, geen bankofferte. */
export const NHG_RATE_OFFSET = 0.2;

const ECB_SERIES: Record<FixedPeriodYears, string> = {
  5: "M.NL.B.A2C.I.R.A.2250.EUR.N",
  10: "M.NL.B.A2C.O.R.A.2250.EUR.N",
  20: "M.NL.B.A2C.P.R.A.2250.EUR.N",
  30: "M.NL.B.A2C.P.R.A.2250.EUR.N",
};

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

export function parseEcbMirObservation(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as {
    dataSets?: { series?: Record<string, { observations?: Record<string, [number, ...unknown[]]> }> }[];
    structure?: { dimensions?: { observation?: { values?: { id?: string }[] }[] } };
  };
  const series = record.dataSets?.[0]?.series;
  if (!series) return null;
  const first = Object.values(series)[0];
  const observations = first?.observations;
  if (!observations) return null;
  const value = Object.values(observations)[0]?.[0];
  const period = record.structure?.dimensions?.observation?.[0]?.values?.[0]?.id;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 20) return null;
  return { rate: Math.round(value * 100) / 100, period: period ?? "" };
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
  };
}

async function fetchAfmToetsrente() {
  const response = await fetch(AFM_TOETSRENTE_URL, { headers: FETCH_HEADERS, next: { revalidate: 21_600 } });
  if (!response.ok) throw new Error(`AFM HTTP ${response.status}`);
  const parsed = parseAfmToetsrente(await response.text());
  if (!parsed) throw new Error("AFM toetsrente kon niet worden gelezen");
  return parsed;
}

async function fetchEcbRate(period: FixedPeriodYears) {
  const url = `${ECB_MIR_URL}/${ECB_SERIES[period]}?lastNObservations=1&format=jsondata`;
  const response = await fetch(url, { headers: { ...FETCH_HEADERS, Accept: "application/json" }, next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error(`ECB HTTP ${response.status}`);
  const parsed = parseEcbMirObservation(await response.json());
  if (!parsed) throw new Error("ECB-rente kon niet worden gelezen");
  return parsed;
}

export async function loadMortgageMarket(): Promise<MortgageMarketSnapshot> {
  const snapshot = fallbackSnapshot();
  const [afm, five, ten, long] = await Promise.allSettled([
    fetchAfmToetsrente(),
    fetchEcbRate(5),
    fetchEcbRate(10),
    fetchEcbRate(20),
  ]);
  if (afm.status === "fulfilled") {
    snapshot.toetsrente = {
      rate: Math.max(AFM_TOETSRENTE_FLOOR, afm.value.rate),
      label: afm.value.label,
      sourceUrl: AFM_TOETSRENTE_URL,
      live: true,
    };
  }
  if (five.status === "fulfilled" && ten.status === "fulfilled" && long.status === "fulfilled") {
    const asRate = (value: number, nhg: boolean) => Math.round((nhg ? Math.max(0, value - NHG_RATE_OFFSET) : value) * 100) / 100;
    snapshot.indicativeRates = {
      asOf: ten.value.period || snapshot.indicativeRates.asOf,
      source: "DNB/ECB nieuwe woninghypotheken (banken)",
      sourceUrl: "https://data.ecb.europa.eu/data/datasets/MIR/MIR.M.NL.B.A2C.O.R.A.2250.EUR.N",
      live: true,
      byPeriod: {
        5: { nhg: asRate(five.value.rate, true), other: asRate(five.value.rate, false) },
        10: { nhg: asRate(ten.value.rate, true), other: asRate(ten.value.rate, false) },
        20: { nhg: asRate(long.value.rate, true), other: asRate(long.value.rate, false) },
        30: { nhg: asRate(long.value.rate, true), other: asRate(long.value.rate, false) },
      },
    };
  }
  return snapshot;
}
