/**
 * CBS OData client for energy tariffs and household energy consumption.
 *
 * - 85592ENG: monthly consumer energy prices (gas EUR/m3, electricity EUR/kWh)
 * - 85140NED: yearly energy consumption per dwelling by type/area/year/heating
 *
 * Both datasets are CC-BY 4.0 from CBS / Statistics Netherlands.
 */

const CBS_API = "https://opendata.cbs.nl/ODataApi/OData";

// ---------------------------------------------------------------------------
// CBS 85592ENG – Average energy prices for consumers
// ---------------------------------------------------------------------------

const TARIFF_TABLE = "85592ENG";
const VAT_INCL = "A048944";

type TariffRow = {
  VAT: string;
  Periods: string;
  VariableSupplyRateContractPrices_3: number | null; // gas EUR/m3
  EnergyTax_6: number | null; // gas energy tax EUR/m3
  TransportRate_1: number | null; // gas transport EUR/yr
  FixedSupplyRateFixedAndVariable_2: number | null; // gas fixed supply EUR/yr
  VariableSupplyRateContractPrices_9: number | null; // electricity EUR/kWh
  EnergyTax_14: number | null; // electricity energy tax EUR/kWh
  TransportRate_7: number | null; // electricity transport EUR/yr
  FixedSupplyRateFixedAndVariable_8: number | null; // electricity fixed supply EUR/yr
  EnergyTaxRefund_15: number | null; // electricity tax refund EUR/yr
};

export type EnergyTariffs = {
  gasSupplyPerM3: number;
  gasTaxPerM3: number;
  gasTotalPerM3: number;
  electricitySupplyPerKwh: number;
  electricityTaxPerKwh: number;
  electricityTotalPerKwh: number;
  gasFixedYearly: number;
  electricityFixedYearly: number;
  electricityTaxRefundYearly: number;
  period: string;
  source: string;
};

export const FALLBACK_TARIFFS: EnergyTariffs = {
  gasSupplyPerM3: 0.58,
  gasTaxPerM3: 0.73,
  gasTotalPerM3: 1.31,
  electricitySupplyPerKwh: 0.15,
  electricityTaxPerKwh: 0.12,
  electricityTotalPerKwh: 0.27,
  gasFixedYearly: 337,
  electricityFixedYearly: 575,
  electricityTaxRefundYearly: -635,
  period: "fallback-2026",
  source: "Indicatie WoonReality (niet live CBS)",
};

export async function fetchLatestEnergyTariffs(): Promise<EnergyTariffs> {
  const year = new Date().getFullYear();
  const select = [
    "VAT", "Periods",
    "VariableSupplyRateContractPrices_3", "EnergyTax_6",
    "TransportRate_1", "FixedSupplyRateFixedAndVariable_2",
    "VariableSupplyRateContractPrices_9", "EnergyTax_14",
    "TransportRate_7", "FixedSupplyRateFixedAndVariable_8",
    "EnergyTaxRefund_15",
  ].join(",");

  const filter = `VAT eq '${VAT_INCL}' and startswith(Periods,'${year}')`;
  const url = `${CBS_API}/${TARIFF_TABLE}/TypedDataSet?$filter=${filter}&$select=${select}&$format=json`;

  const response = await fetch(url, { next: { revalidate: 86400 } });
  if (!response.ok) {
    console.warn(`CBS tariff fetch failed (${response.status}), using fallback`);
    return FALLBACK_TARIFFS;
  }
  const payload = await response.json() as { value?: TariffRow[] };
  const rows = payload.value ?? [];
  const row = rows.sort((a, b) => b.Periods.localeCompare(a.Periods))[0];
  if (!row || row.VariableSupplyRateContractPrices_3 == null || row.VariableSupplyRateContractPrices_9 == null) {
    return FALLBACK_TARIFFS;
  }

  const gasSupply = row.VariableSupplyRateContractPrices_3;
  const gasTax = row.EnergyTax_6 ?? 0;
  const elecSupply = row.VariableSupplyRateContractPrices_9;
  const elecTax = row.EnergyTax_14 ?? 0;

  return {
    gasSupplyPerM3: gasSupply,
    gasTaxPerM3: gasTax,
    gasTotalPerM3: gasSupply + gasTax,
    electricitySupplyPerKwh: elecSupply,
    electricityTaxPerKwh: elecTax,
    electricityTotalPerKwh: elecSupply + elecTax,
    gasFixedYearly: (row.TransportRate_1 ?? 0) + (row.FixedSupplyRateFixedAndVariable_2 ?? 0),
    electricityFixedYearly: (row.TransportRate_7 ?? 0) + (row.FixedSupplyRateFixedAndVariable_8 ?? 0),
    electricityTaxRefundYearly: row.EnergyTaxRefund_15 ?? 0,
    period: row.Periods.trim(),
    source: "CBS 85592ENG – Energieprijzen consumenten",
  };
}

// ---------------------------------------------------------------------------
// CBS 85140NED – Energieverbruik woningen
// ---------------------------------------------------------------------------

const CONSUMPTION_TABLE = "85140NED";

type ConsumptionRow = {
  Perioden: string;
  GemiddeldeAardgasleveringTempGecorr_3: number | null;
  GemiddeldeAardgasTempGecPerOpp_13: number | null;
  GemiddeldeElektriciteitslevering_23: number | null;
};

export type EnergyConsumption = {
  avgGasM3: number;
  gasM3PerM2: number;
  avgElectricityKwh: number;
  period: string;
  source: string;
};

export const FALLBACK_CONSUMPTION: EnergyConsumption = {
  avgGasM3: 1050,
  gasM3PerM2: 10.5,
  avgElectricityKwh: 2750,
  period: "fallback",
  source: "Indicatie WoonReality (niet live CBS)",
};

const AREA_CLASS_MAP: { max: number; key: string }[] = [
  { max: 50, key: "A050300" },
  { max: 75, key: "A025408" },
  { max: 100, key: "A025409" },
  { max: 150, key: "A025410" },
  { max: 250, key: "A025411" },
  { max: Infinity, key: "A050301" },
];

export function areaToClassKey(areaM2: number): string {
  if (areaM2 < 2) return "T001116";
  return (AREA_CLASS_MAP.find((c) => areaM2 < c.max) ?? AREA_CLASS_MAP[AREA_CLASS_MAP.length - 1]).key;
}

const BUILDING_YEAR_MAP: { max: number; key: string }[] = [
  { max: 1946, key: "ZW25799" },
  { max: 1965, key: "ZW25800" },
  { max: 1975, key: "ZW10406" },
  { max: 1992, key: "ZW25801" },
  { max: 2006, key: "ZW25815" },
  { max: 2015, key: "ZW25818" },
  { max: Infinity, key: "ZW25797" },
];

export function buildingYearToClassKey(year: number): string {
  return (BUILDING_YEAR_MAP.find((c) => year < c.max) ?? BUILDING_YEAR_MAP[BUILDING_YEAR_MAP.length - 1]).key;
}

const HOUSING_TYPE_MAP: Record<string, string> = {
  vrijstaand: "ZW10320",
  "2-onder-1-kap": "ZW10300",
  hoekwoning: "ZW25806",
  tussenwoning: "ZW25805",
  appartement: "ZW25810",
};

export function housingTypeToKey(type?: string): string {
  if (!type) return "T001100";
  const lower = type.toLowerCase();
  for (const [fragment, key] of Object.entries(HOUSING_TYPE_MAP)) {
    if (lower.includes(fragment)) return key;
  }
  return "T001100";
}

export async function fetchEnergyConsumption(
  areaM2?: number,
  buildingYear?: number,
  housingType?: string,
): Promise<EnergyConsumption> {
  const areaKey = areaM2 ? areaToClassKey(areaM2) : "T001116";
  const yearKey = buildingYear ? buildingYearToClassKey(buildingYear) : "T001018";
  const typeKey = housingTypeToKey(housingType);

  const filters = [
    `Woningtype eq '${typeKey}'`,
    `Gebruiksoppervlakte eq '${areaKey}'`,
    `Bouwjaar eq '${yearKey}'`,
    `Bewonersklasse eq 'T001351'`,
    `HoofdverwarmingEnZonnestroom eq 'T001614'`,
  ].join(" and ");

  const select = [
    "Perioden",
    "GemiddeldeAardgasleveringTempGecorr_3",
    "GemiddeldeAardgasTempGecPerOpp_13",
    "GemiddeldeElektriciteitslevering_23",
  ].join(",");

  const url = `${CBS_API}/${CONSUMPTION_TABLE}/TypedDataSet?$filter=${filters}&$select=${select}&$format=json`;

  const response = await fetch(url, { next: { revalidate: 604800 } });
  if (!response.ok) {
    console.warn(`CBS consumption fetch failed (${response.status}), using fallback`);
    return FALLBACK_CONSUMPTION;
  }
  const payload = await response.json() as { value?: ConsumptionRow[] };
  const rows = payload.value ?? [];
  const row = rows.sort((a, b) => b.Perioden.localeCompare(a.Perioden))[0];
  if (!row) {
    return FALLBACK_CONSUMPTION;
  }

  return {
    avgGasM3: row.GemiddeldeAardgasleveringTempGecorr_3 ?? FALLBACK_CONSUMPTION.avgGasM3,
    gasM3PerM2: row.GemiddeldeAardgasTempGecPerOpp_13 ?? FALLBACK_CONSUMPTION.gasM3PerM2,
    avgElectricityKwh: row.GemiddeldeElektriciteitslevering_23 ?? FALLBACK_CONSUMPTION.avgElectricityKwh,
    period: row.Perioden.trim(),
    source: "CBS 85140NED – Energieverbruik woningen",
  };
}
