import type { EnergyTariffs, EnergyConsumption } from "@/src/lib/sources/cbs-energy";

export type RunningCostCategory = "energy" | "housing" | "tax";

export type RunningCostLine = {
  key: string;
  label: string;
  amountYearly: number;
  amountMonthly: number;
  note: string;
  category: RunningCostCategory;
  cbsSourced: boolean;
};

export type RunningCostEstimate = {
  lines: RunningCostLine[];
  monthlyTotal: number;
  yearlyTotal: number;
  tariffPeriod: string;
  consumptionPeriod: string;
  tariffSource: string;
  consumptionSource: string;
  disclaimer: string;
};

export type RunningCostInput = {
  tariffs: EnergyTariffs;
  consumption: EnergyConsumption;
  areaM2?: number;
  vveContribution?: number;
  gasConnection?: boolean;
};

const WATER_YEARLY = 200;
const MUNICIPAL_TAXES_YEARLY = 400;
const INSURANCE_PER_M2_YEARLY = 0.50;

function round(value: number) {
  return Math.round(value);
}

function isGasloos(gasConnection?: boolean): boolean {
  return gasConnection === false;
}

export function estimateRunningCosts(input: RunningCostInput): RunningCostEstimate {
  const { tariffs, consumption, areaM2, vveContribution, gasConnection } = input;
  const lines: RunningCostLine[] = [];

  const tariffsCbsSourced = tariffs.source.startsWith("CBS 85592ENG");
  const consumptionCbsSourced = consumption.source.startsWith("CBS 85140NED");
  const cbsSourcedEnergy = tariffsCbsSourced && consumptionCbsSourced;

  const elecYearly = round(
    consumption.avgElectricityKwh * tariffs.electricityTotalPerKwh
    + tariffs.electricityFixedYearly
    + tariffs.electricityTaxRefundYearly,
  );
  lines.push({
    key: "electricity",
    label: "Elektriciteit",
    amountYearly: Math.max(0, elecYearly),
    amountMonthly: Math.max(0, round(elecYearly / 12)),
    note: `~${consumption.avgElectricityKwh.toLocaleString("nl-NL")} kWh/jaar × ${tariffs.electricityTotalPerKwh.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })}/kWh + vaste kosten.`,
    category: "energy",
    cbsSourced: cbsSourcedEnergy,
  });

  if (!isGasloos(gasConnection)) {
    const gasYearly = round(
      consumption.avgGasM3 * tariffs.gasTotalPerM3
      + tariffs.gasFixedYearly,
    );
    lines.push({
      key: "gas",
      label: "Gas",
      amountYearly: Math.max(0, gasYearly),
      amountMonthly: Math.max(0, round(gasYearly / 12)),
      note: `~${consumption.avgGasM3.toLocaleString("nl-NL")} m³/jaar × ${tariffs.gasTotalPerM3.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })}/m³ + vaste kosten. Inclusief verwarming, warm water en koken.`,
      category: "energy",
      cbsSourced: cbsSourcedEnergy,
    });
  }

  lines.push({
    key: "water",
    label: "Water",
    amountYearly: WATER_YEARLY,
    amountMonthly: round(WATER_YEARLY / 12),
    note: "Landelijk gemiddelde drinkwaterkosten per huishouden.",
    category: "energy",
    cbsSourced: false,
  });

  if (vveContribution != null && vveContribution > 0) {
    const yearly = round(vveContribution * 12);
    lines.push({
      key: "vve",
      label: "VvE-bijdrage",
      amountYearly: yearly,
      amountMonthly: round(vveContribution),
      note: "Maandelijkse bijdrage aan de Vereniging van Eigenaren (uit advertentie).",
      category: "housing",
      cbsSourced: false,
    });
  }

  lines.push({
    key: "municipal-taxes",
    label: "Gemeentelijke belastingen",
    amountYearly: MUNICIPAL_TAXES_YEARLY,
    amountMonthly: round(MUNICIPAL_TAXES_YEARLY / 12),
    note: "Indicatie OZB, rioolheffing en afvalstoffenheffing. Verschilt per gemeente.",
    category: "tax",
    cbsSourced: false,
  });

  if (areaM2 && areaM2 > 0) {
    const insuranceYearly = round(areaM2 * INSURANCE_PER_M2_YEARLY);
    lines.push({
      key: "insurance",
      label: "Opstalverzekering",
      amountYearly: insuranceYearly,
      amountMonthly: round(insuranceYearly / 12),
      note: `Indicatie op basis van ${areaM2} m² woonoppervlak.`,
      category: "housing",
      cbsSourced: false,
    });
  }

  const yearlyTotal = lines.reduce((sum, l) => sum + l.amountYearly, 0);
  const monthlyTotal = lines.reduce((sum, l) => sum + l.amountMonthly, 0);

  return {
    lines,
    monthlyTotal,
    yearlyTotal,
    tariffPeriod: tariffs.period,
    consumptionPeriod: consumption.period,
    tariffSource: tariffs.source,
    consumptionSource: consumption.source,
    disclaimer: "Dit is een indicatie op basis van CBS-gemiddelden en vaste schattingen, geen persoonlijke offerte. Werkelijke kosten hangen af van leverancier, verbruik, gemeente en woningsituatie.",
  };
}
