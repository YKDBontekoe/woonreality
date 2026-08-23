import type { AnalysisContexts } from "@/src/lib/analysis/context";
import type { KnownGap, SourceStatus } from "@/src/lib/types";
import { cbsBuurtenUrl } from "@/src/lib/sources/cbs";
import { epOnlineUrl } from "@/src/lib/sources/ep-online";
import { ndovHaltesUrl } from "@/src/lib/sources/ndov";
import { dsoOnderwerpenUrl } from "@/src/lib/sources/dso";
import { sesStatLineTableUrl } from "@/src/lib/sources/ses";
import { politieMisdrijvenTableUrl } from "@/src/lib/sources/politie";
import { pdokUrls } from "@/src/lib/sources/pdok/bgt";
import { rivmUrls } from "@/src/lib/sources/rivm";

export function sourceStatuses(contexts: AnalysisContexts): SourceStatus[] {
  const {
    bgt, nearbyAvailable, energyLabel, rivm, cbs, ses, crime, ndov, dso, bodem, bodemAvailable,
  } = contexts;
  const bgtAvailable = bgt != null;
  const energyAvailable = energyLabel != null;
  const rivmMetricCount = [rivm?.noiseLden, rivm?.no2, rivm?.pm25, rivm?.floodClass].filter((value) => value != null).length;
  return [
    { source: "PDOK / BAG", status: "ok", sourceUrl: pdokUrls.bag },
    { source: "PDOK / BGT", status: bgtAvailable ? "ok" : "unavailable", message: bgtAvailable ? undefined : "Lokale topografie kon niet worden opgehaald.", sourceUrl: pdokUrls.bgt },
    { source: "PDOK / BAG omgeving", status: nearbyAvailable ? "ok" : "unavailable", message: nearbyAvailable ? undefined : "Nabije adressen konden niet worden opgehaald.", sourceUrl: pdokUrls.bag },
    { source: "EP-Online / RVO", status: energyAvailable ? "ok" : "unavailable", message: energyAvailable ? undefined : "Energielabels zijn nu niet beschikbaar voor dit adres.", sourceUrl: epOnlineUrl },
    {
      source: "RIVM geo-services",
      status: rivmMetricCount === 4 ? "ok" : rivmMetricCount > 0 ? "partial" : "unavailable",
      message: rivmMetricCount > 0 ? undefined : "RIVM-rasterwaarden konden niet worden opgehaald.",
      sourceUrl: rivmUrls.noise,
    },
    { source: "CBS Wijk- en Buurtkaart", status: cbs ? "ok" : "unavailable", message: cbs ? undefined : "Geen CBS-buurtfeature gevonden of bron niet bereikbaar.", sourceUrl: cbsBuurtenUrl },
    { source: "CBS SES-WOA", status: ses ? "ok" : "unavailable", message: ses ? undefined : "Geen SES-WOA-score beschikbaar voor deze buurt.", sourceUrl: sesStatLineTableUrl },
    { source: "Politie / CBS misdrijven", status: crime ? "ok" : "unavailable", message: crime ? undefined : "Geen geregistreerde misdrijvencijfers beschikbaar voor deze buurt.", sourceUrl: politieMisdrijvenTableUrl },
    { source: "NDOV haltes", status: ndov ? "ok" : "unavailable", message: ndov ? undefined : "De openbare haltecatalogus kon niet worden opgehaald.", sourceUrl: ndovHaltesUrl },
    { source: "DSO Omgevingsdocumenten", status: dso ? "ok" : "unavailable", message: dso ? undefined : "Ruimtelijke onderwerpen zijn nu niet beschikbaar voor dit adres.", sourceUrl: dsoOnderwerpenUrl },
    {
      source: "Lokale bodemregisters (WFS)",
      status: !bodemAvailable
        ? "unavailable"
        : bodem
          ? (bodem.overallStatus === "ok" ? "ok" : "partial")
          : "unavailable",
      message:
        !bodemAvailable
          ? "Bodemregister WFS kon niet worden opgehaald."
          : bodem
            ? bodem.totalMatches === 0
              ? "Geen bodemregister-hits gevonden in de beschikbare regionale WFS-datasets voor dit adres."
              : undefined
            : "Bodemregister WFS is nog niet (volledig) geconfigureerd voor deze provincie.",
      sourceUrl: bodem ? bodem.providers.map((provider) => provider.sourceUrl).join(", ") : undefined,
    },
  ];
}

export const KNOWN_GAPS: KnownGap[] = [
  {
    key: "flood-risk",
    label: "Waterdiepte en regenwateroverlast",
    summary: "WoonReality toont wel een indicatie van de kans op overstroming bij falen van primaire keringen (RIVM-raster), maar geen verwachte waterdiepte per scenario en geen wateroverlast bij hevige regen (pluvial). Dat laatste hangt sterk af van het gemeentelijk riolerings- en bergingsplan.",
    checkUrl: "https://www.risicokaart.nl/",
    checkLabel: "Check Risicokaart.nl",
  },
  {
    key: "soil-contamination",
    label: "Bodemverontreiniging",
    summary: "Bodemkwaliteit en historische activiteiten (bv. een voormalige stortplaats of tankstation) worden niet volledig landelijk gecontroleerd; dit vraagt een provinciaal of gemeentelijk bodemloket. In sommige regio's kan WoonReality via regionale WFS-datasets wel een indicatie tonen, maar dit is geen sluitend bewijs.",
    checkUrl: "https://www.bodemloket.nl/",
    checkLabel: "Check Bodemloket.nl",
  },
];
