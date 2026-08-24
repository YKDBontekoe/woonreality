import type { AnalysisContexts } from "@/src/lib/analysis/context";
import type { KnownGap, SourceStatus } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { cbsBuurtenUrl } from "@/src/lib/sources/cbs";
import { epOnlineUrl } from "@/src/lib/sources/ep-online";
import { ndovHaltesUrl } from "@/src/lib/sources/ndov";
import { dsoOnderwerpenUrl } from "@/src/lib/sources/dso";
import { sesStatLineTableUrl } from "@/src/lib/sources/ses";
import { politieMisdrijvenTableUrl } from "@/src/lib/sources/politie";
import { pdokUrls } from "@/src/lib/sources/pdok/bgt";
import { rivmUrls } from "@/src/lib/sources/rivm";

export function sourceStatuses(contexts: AnalysisContexts, locale: Locale = "nl"): SourceStatus[] {
  const t = getLibTranslator(locale, "lib-analysis");
  const {
    bgt, nearbyAvailable, energyLabel, rivm, cbs, ses, crime, ndov, dso, bodem, bodemAvailable,
  } = contexts;
  const bgtAvailable = bgt != null;
  const energyAvailable = energyLabel != null;
  const rivmMetricCount = [rivm?.noiseLden, rivm?.no2, rivm?.pm25, rivm?.floodClass].filter((value) => value != null).length;
  return [
    { source: "PDOK / BAG", status: "ok", sourceUrl: pdokUrls.bag },
    { source: "PDOK / BGT", status: bgtAvailable ? "ok" : "unavailable", message: bgtAvailable ? undefined : t("status.bgtMissing"), sourceUrl: pdokUrls.bgt },
    { source: "PDOK / BAG omgeving", status: nearbyAvailable ? "ok" : "unavailable", message: nearbyAvailable ? undefined : t("status.nearbyMissing"), sourceUrl: pdokUrls.bag },
    { source: "EP-Online / RVO", status: energyAvailable ? "ok" : "unavailable", message: energyAvailable ? undefined : t("status.energyMissing"), sourceUrl: epOnlineUrl },
    {
      source: "RIVM geo-services",
      status: rivmMetricCount === 4 ? "ok" : rivmMetricCount > 0 ? "partial" : "unavailable",
      message: rivmMetricCount > 0 ? undefined : t("status.rivmMissing"),
      sourceUrl: rivmUrls.noise,
    },
    { source: "CBS Wijk- en Buurtkaart", status: cbs ? "ok" : "unavailable", message: cbs ? undefined : t("status.cbsMissing"), sourceUrl: cbsBuurtenUrl },
    { source: "CBS SES-WOA", status: ses ? "ok" : "unavailable", message: ses ? undefined : t("status.sesMissing"), sourceUrl: sesStatLineTableUrl },
    { source: "Politie / CBS misdrijven", status: crime ? "ok" : "unavailable", message: crime ? undefined : t("status.crimeMissing"), sourceUrl: politieMisdrijvenTableUrl },
    { source: "NDOV haltes", status: ndov ? "ok" : "unavailable", message: ndov ? undefined : t("status.ndovMissing"), sourceUrl: ndovHaltesUrl },
    { source: "DSO Omgevingsdocumenten", status: dso ? "ok" : "unavailable", message: dso ? undefined : t("status.dsoMissing"), sourceUrl: dsoOnderwerpenUrl },
    {
      source: "Lokale bodemregisters (WFS)",
      status: !bodemAvailable
        ? "unavailable"
        : bodem
          ? (bodem.overallStatus === "ok" ? "ok" : "partial")
          : "unavailable",
      message:
        !bodemAvailable
          ? t("status.bodemUnavailable")
          : bodem
            ? bodem.totalMatches === 0
              ? t("status.bodemNoHits")
              : undefined
            : t("status.bodemNotConfigured"),
      sourceUrl: bodem ? bodem.providers.map((provider) => provider.sourceUrl).join(", ") : undefined,
    },
  ];
}

export function knownGaps(locale: Locale = "nl"): KnownGap[] {
  const t = getLibTranslator(locale, "lib-analysis");
  return [
    {
      key: "flood-risk",
      label: t("gap.floodRisk.label"),
      summary: t("gap.floodRisk.summary"),
      checkUrl: "https://www.risicokaart.nl/",
      checkLabel: t("gap.floodRisk.checkLabel"),
    },
    {
      key: "soil-contamination",
      label: t("gap.soil.label"),
      summary: t("gap.soil.summary"),
      checkUrl: "https://www.bodemloket.nl/",
      checkLabel: t("gap.soil.checkLabel"),
    },
  ];
}

/** @deprecated Dutch-only legacy list; prefer knownGaps(locale). */
export const KNOWN_GAPS: KnownGap[] = knownGaps();
