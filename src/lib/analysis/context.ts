import { logWarn } from "@/src/lib/logger";
import { getBgtContext, type BgtContext } from "@/src/lib/sources/pdok/bgt";
import { getNearbyProperties } from "@/src/lib/sources/pdok/bag";
import { getEnergyLabel } from "@/src/lib/sources/ep-online";
import { getRivmContext, type RivmContext } from "@/src/lib/sources/rivm";
import { getCbsContext, getAverageWozByGemeenteCode, getAverageWozByWijkCode, type CbsContext } from "@/src/lib/sources/cbs";
import { getNdovContext, type NdovContext } from "@/src/lib/sources/ndov";
import { getDsoContext, type DsoContext } from "@/src/lib/sources/dso";
import { getSesContext, type SesContext } from "@/src/lib/sources/ses";
import { getCrimeContext, type CrimeContext } from "@/src/lib/sources/politie";
import { getBodemContext, type BodemContext } from "@/src/lib/sources/bodem";
import type { NearbyProperty, Property, WozBenchmark } from "@/src/lib/types";

/**
 * Everything the signal builders need, fetched once per analysis. Every field
 * is nullable so a failing open-data source degrades its own signals without
 * sinking the whole report.
 */
export type AnalysisContexts = {
  bgt: BgtContext | null;
  nearbyAvailable: boolean;
  nearbyProperties: NearbyProperty[];
  energyLabel: string | null;
  energyRegistratedAt?: string;
  rivm: RivmContext | null;
  cbs: CbsContext | null;
  ndov: NdovContext | null;
  dso: DsoContext | null;
  ses: SesContext | null;
  crime: CrimeContext | null;
  bodem: BodemContext | null;
  /** False only when the bodem WFS sweep itself threw (vs. returning no data for this province). */
  bodemAvailable: boolean;
  wozBenchmark: WozBenchmark | null;
};

function fulfilled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function reportRejection(label: string, result: PromiseSettledResult<unknown>) {
  if (result.status === "rejected") logWarn(`${label} unavailable`, result.reason);
}

export async function fetchAnalysisContexts(property: Property): Promise<AnalysisContexts> {
  // All eight independent sources run concurrently; SES and crime need CBS
  // region codes first, so they form a second dependent batch.
  const [bgtResult, nearbyResult, energyResult, rivmResult, cbsResult, ndovResult, dsoResult, bodemResult] =
    await Promise.allSettled([
      getBgtContext(property.coordinates),
      getNearbyProperties(property),
      getEnergyLabel(property),
      getRivmContext(property.coordinates),
      getCbsContext(property.coordinates),
      getNdovContext(property.coordinates),
      getDsoContext(property.coordinates),
      getBodemContext(property.coordinates, property.province),
    ]);

  reportRejection("BGT", bgtResult);
  reportRejection("Nearby BAG properties", nearbyResult);
  reportRejection("EP-Online", energyResult);
  reportRejection("RIVM", rivmResult);
  reportRejection("CBS buurtcontext", cbsResult);
  reportRejection("NDOV haltes", ndovResult);
  reportRejection("DSO onderwerpen", dsoResult);
  reportRejection("Bodemregister WFS", bodemResult);

  const bgt = fulfilled(bgtResult, null as BgtContext | null);
  const nearbyProperties = fulfilled(nearbyResult, [] as NearbyProperty[]);
  const energy = fulfilled(energyResult, null as Awaited<ReturnType<typeof getEnergyLabel>>);
  const rivm = fulfilled(rivmResult, null as RivmContext | null);
  const cbs = fulfilled(cbsResult, null as CbsContext | null);

  const [sesResult, crimeResult, wozWijkResult, wozGemeenteResult] = await Promise.allSettled([
    cbs ? getSesContext(cbs) : Promise.resolve(null),
    cbs ? getCrimeContext(cbs) : Promise.resolve(null),
    cbs?.wijkcode ? getAverageWozByWijkCode(cbs.wijkcode) : Promise.resolve(undefined),
    cbs?.gemeentecode ? getAverageWozByGemeenteCode(cbs.gemeentecode) : Promise.resolve(undefined),
  ]);
  reportRejection("CBS SES-WOA", sesResult);
  reportRejection("Politie misdrijven", crimeResult);
  reportRejection("CBS WOZ wijk", wozWijkResult);
  reportRejection("CBS WOZ gemeente", wozGemeenteResult);

  const wijkAverage = fulfilled(wozWijkResult, null as number | null | undefined);
  const gemeenteAverage = fulfilled(wozGemeenteResult, null as number | null | undefined);

  const wozBenchmark: WozBenchmark | null = cbs
    ? {
      buurtName: cbs.buurtName,
      // CBS reports gemiddelde_woningwaarde in thousands of euros (x 1 000).
      buurtAverage: cbs.averageWoz != null ? cbs.averageWoz * 1000 : undefined,
      wijkAverage: wijkAverage != null ? wijkAverage * 1000 : undefined,
      gemeenteAverage: gemeenteAverage != null ? gemeenteAverage * 1000 : undefined,
      fetchedAt: new Date().toISOString(),
    }
    : null;

  return {
    bgt,
    nearbyAvailable: nearbyResult.status === "fulfilled",
    nearbyProperties,
    energyLabel: energy?.Energieklasse ?? null,
    energyRegistratedAt: energy?.Registratiedatum ?? energy?.Opnamedatum,
    rivm,
    cbs,
    ndov: fulfilled(ndovResult, null as NdovContext | null),
    dso: fulfilled(dsoResult, null as DsoContext | null),
    ses: fulfilled(sesResult, null as SesContext | null),
    crime: fulfilled(crimeResult, null as CrimeContext | null),
    bodem: fulfilled(bodemResult, null as BodemContext | null),
    bodemAvailable: bodemResult.status === "fulfilled",
    wozBenchmark: cbs ? wozBenchmark : null,
  };
}

/** Sibling dwellings inside the same BAG pand point to an apartment/VvE situation. */
export function siblingResidentialUnits(contexts: AnalysisContexts, property: Property) {
  return contexts.nearbyProperties.filter(
    (item) => item.pandIds?.some((id) => property.bagPandIds.includes(id)),
  );
}
