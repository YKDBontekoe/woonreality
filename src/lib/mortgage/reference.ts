/**
 * Jaargescheiden wettelijke en indicatieve parameters voor aankoopkosten,
 * NHG en box-1 eigen woning. Formules blijven jaar-onafhankelijk;
 * een nieuw belastingjaar is een nieuwe tabel, geen herschrijf.
 *
 * Live marktrente/AFM-toetsrente zit in market.ts — niet hier.
 */

export type MortgageReference = {
  year: number;
  effectiveFrom: string;
  sources: {
    transferTax: string;
    nhg: string;
    kadaster: string;
    box1: string;
    eigenwoningforfait: string;
  };
  transferTax: {
    starterThreshold: number;
    starterMinAge: number;
    starterMaxAge: number;
    starterRate: number;
    ownerOccupierRate: number;
    investorResidentialRate: number;
    nonResidentialRate: number;
  };
  nhg: {
    limit: number;
    energyLimit: number;
    feeRate: number;
  };
  kadaster: {
    kikPerDeed: number;
    electronicPerDeed: number;
  };
  costs: {
    transferDeed: number;
    mortgageDeed: number;
    appraisal: number;
    inspection: number;
    advice: number;
    moving: number;
    buyingAgentPctExclVat: number;
    vatRate: number;
    bankGuaranteeFeeRate: number;
    depositFraction: number;
  };
  box1: {
    brackets: { upTo: number; rate: number }[];
    maxHousingDeductionRate: number;
  };
  eigenwoningforfait: {
    bands: { upTo: number; rate: number }[];
    villaThreshold: number;
    villaBase: number;
    villaRate: number;
  };
  hillenRate: number;
};

const REF_2026: MortgageReference = {
  year: 2026,
  effectiveFrom: "2026-01-01",
  sources: {
    transferTax: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/woning/overdrachtsbelasting/tarieven_overdrachtsbelasting/",
    nhg: "https://www.nhg.nl/nhg-actueel/nhg-grens-in-2026-vastgesteld-op-470000/",
    kadaster: "https://www.kadaster.nl/-/onze-tarieven-in-2026",
    box1: "https://www.belastingdienst.nl/wps/wcm/connect/nl/koopwoning/content/tariefsaanpassing-eigen-woning",
    eigenwoningforfait: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/woning/eigenwoningforfait/",
  },
  transferTax: {
    starterThreshold: 555_000,
    starterMinAge: 18,
    starterMaxAge: 35,
    starterRate: 0,
    ownerOccupierRate: 0.02,
    investorResidentialRate: 0.08,
    nonResidentialRate: 0.104,
  },
  nhg: {
    limit: 470_000,
    energyLimit: 498_200,
    feeRate: 0.004,
  },
  kadaster: {
    kikPerDeed: 103.5,
    electronicPerDeed: 181,
  },
  costs: {
    transferDeed: 850,
    mortgageDeed: 750,
    appraisal: 650,
    inspection: 400,
    advice: 2_500,
    moving: 1_500,
    buyingAgentPctExclVat: 0.01,
    vatRate: 0.21,
    bankGuaranteeFeeRate: 0.01,
    depositFraction: 0.1,
  },
  box1: {
    brackets: [
      { upTo: 38_883, rate: 0.3575 },
      { upTo: 78_426, rate: 0.3756 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.495 },
    ],
    maxHousingDeductionRate: 0.3756,
  },
  eigenwoningforfait: {
    bands: [
      { upTo: 12_500, rate: 0 },
      { upTo: 25_000, rate: 0.001 },
      { upTo: 50_000, rate: 0.002 },
      { upTo: 75_000, rate: 0.0025 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.0035 },
    ],
    villaThreshold: 1_350_000,
    villaBase: 4_725,
    villaRate: 0.0235,
  },
  hillenRate: 0.71867,
};

const REFERENCES: MortgageReference[] = [REF_2026];

export function mortgageReferences() {
  return REFERENCES;
}

export function mortgageReferenceForYear(year: number): MortgageReference {
  const sorted = [...REFERENCES].sort((a, b) => b.year - a.year);
  return sorted.find((ref) => ref.year <= year) ?? sorted[sorted.length - 1];
}

export function currentReferenceYear(now = new Date()) {
  return mortgageReferenceForYear(now.getFullYear()).year;
}

export function currentMortgageReference(now = new Date()) {
  return mortgageReferenceForYear(now.getFullYear());
}
