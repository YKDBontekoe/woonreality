import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { schoolScoreFromCbs, type CbsContext } from "@/src/lib/sources/cbs";
import { createSignal } from "@/src/lib/analysis/signals/create-signal";
import { crimeScoreFromRatePer1000, type CrimeContext } from "@/src/lib/sources/politie";
import { type SesContext } from "@/src/lib/sources/ses";
import { formatLocaleTag } from "@/src/lib/format-locale";

function clamp(value: number, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

function formatKm(distanceKm: number, locale: Locale) {
  return `${distanceKm.toLocaleString(formatLocaleTag(locale), { maximumFractionDigits: 1 })} km`;
}

function formatPct(value: number, locale: Locale) {
  return `${value.toLocaleString(formatLocaleTag(locale), { maximumFractionDigits: 0 })}%`;
}

function formatSesScore(value: number, locale: Locale) {
  return value.toLocaleString(formatLocaleTag(locale), { signDisplay: "exceptZero", maximumFractionDigits: 3 });
}

export function createCbsEvidence(cbs: CbsContext | null, sourceUrl: string, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "cbs-buurtcontext",
    source: "CBS Wijk- en Buurtkaart",
    sourceUrl,
    confidence: "medium",
    fetchedAt: cbs?.fetchedAt,
    spatialResolution: t("common.spatialBuurt"),
    caveat: t("neighborhood.caveats.cbs"),
  });
}

export function createSesEvidence(ses: SesContext | null, sourceUrl: string, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "cbs-ses-woa",
    source: "CBS SES-WOA",
    sourceUrl,
    sourceRecordId: ses?.regionCode,
    sourceUpdatedAt: ses?.periodYear,
    confidence: "medium",
    fetchedAt: ses?.fetchedAt,
    spatialResolution: ses?.spatialScale ?? t("common.spatialBuurt"),
    caveat: t("neighborhood.caveats.ses"),
  });
}

export function createCrimeEvidence(crime: CrimeContext | null, sourceUrl: string, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "politie-misdrijven",
    source: "Politie / CBS misdrijven",
    sourceUrl,
    sourceRecordId: crime?.regionCode,
    sourceUpdatedAt: crime?.periodYear,
    confidence: "medium",
    fetchedAt: crime?.fetchedAt,
    spatialResolution: crime?.spatialScale ?? t("common.spatialBuurt"),
    caveat: t("neighborhood.caveats.crime"),
  });
}

export function cbsContextSignal(input: {
  cbs: CbsContext | null;
  cbsEvidence: Evidence;
  spatialScale?: string;
}, locale: Locale = "nl"): Signal {
  const t = getLibTranslator(locale, "lib-analysis");
  const { cbs, cbsEvidence, spatialScale = t("common.spatialBuurt") } = input;
  const cbsAvailable = Boolean(cbs);
  return createSignal({
    key: "cbs-context",
    label: t("neighborhood.context.label"),
    category: "buurt",
    value: cbs?.buurtName ?? cbs?.municipalityName ?? t("common.noData"),
    score: cbs?.supermarketDistanceKm != null ? clamp(9 - cbs.supermarketDistanceKm * 1.5) : cbs ? 6 : undefined,
    summary: cbs?.buurtName || cbs?.municipalityName
      ? t("neighborhood.context.summaryAvailable", {
        name: `${cbs.buurtName ?? cbs.municipalityName}${cbs.buurtName && cbs.municipalityName ? ` (${cbs.municipalityName})` : ""}`,
        supermarket: cbs.supermarketDistanceKm != null ? formatKm(cbs.supermarketDistanceKm, locale) : t("neighborhood.unknown"),
        gp: cbs.huisartsDistanceKm != null ? t("neighborhood.context.gpSuffix", { distance: formatKm(cbs.huisartsDistanceKm, locale) }) : "",
      })
      : t("neighborhood.context.noDataSummary"),
    action: t("neighborhood.context.action"),
    raw: cbs?.supermarketDistanceKm != null ? { value: cbs.supermarketDistanceKm, unit: "km", metric: "CBS gemiddelde afstand supermarkt" } : undefined,
    confidence: "medium",
    spatialScale,
    available: cbsAvailable,
    evidence: cbsEvidence,
  });
}

export function neighborhoodSignals(input: {
  cbs: CbsContext | null;
  ses: SesContext | null;
  crime: CrimeContext | null;
  cbsEvidence: Evidence;
  sesEvidence: Evidence;
  crimeEvidence: Evidence;
  spatialScale?: string;
}, locale: Locale = "nl"): Signal[] {
  const t = getLibTranslator(locale, "lib-analysis");
  const { cbs, ses, crime, cbsEvidence, sesEvidence, crimeEvidence, spatialScale = t("common.spatialBuurt") } = input;
  const schoolScore = cbs ? schoolScoreFromCbs(cbs) : undefined;
  const schoolAvailable = Boolean(cbs && (cbs.primarySchoolDistanceKm != null || cbs.childcareDistanceKm != null || cbs.secondarySchoolDistanceKm != null));
  const childrenAvailable = Boolean(cbs && (cbs.shareAge0to15Pct != null || cbs.shareHouseholdsWithChildrenPct != null || cbs.primaryPupils != null));
  const educationFromSes = ses && (ses.educationLowPct != null || ses.educationMidPct != null || ses.educationHighPct != null);
  const educationFromCbs = Boolean(cbs && (cbs.primaryPupils != null || cbs.secondaryPupils != null || cbs.mboStudents != null || cbs.hboStudents != null || cbs.woStudents != null));
  const educationAvailable = Boolean(educationFromSes || educationFromCbs);
  const crimeScore = crime?.per1000 != null ? crimeScoreFromRatePer1000(crime.per1000) : undefined;
  const schoolParts = [
    cbs?.primarySchoolDistanceKm != null ? t("neighborhood.parts.primarySchool", { distance: formatKm(cbs.primarySchoolDistanceKm, locale) }) : undefined,
    cbs?.primarySchoolsWithin1km != null ? t("neighborhood.parts.schoolsWithin1km", { count: cbs.primarySchoolsWithin1km.toLocaleString(formatLocaleTag(locale), { maximumFractionDigits: 1 }) }) : undefined,
    cbs?.secondarySchoolDistanceKm != null ? t("neighborhood.parts.secondarySchool", { distance: formatKm(cbs.secondarySchoolDistanceKm, locale) }) : undefined,
    cbs?.childcareDistanceKm != null ? t("neighborhood.parts.childcare", { distance: formatKm(cbs.childcareDistanceKm, locale) }) : undefined,
    cbs?.afterSchoolCareDistanceKm != null ? t("neighborhood.parts.afterSchoolCare", { distance: formatKm(cbs.afterSchoolCareDistanceKm, locale) }) : undefined,
  ].filter(Boolean);
  const childrenParts = [
    cbs?.shareAge0to15Pct != null ? t("neighborhood.parts.childrenAge0to15", { share: formatPct(cbs.shareAge0to15Pct, locale) }) : undefined,
    cbs?.shareHouseholdsWithChildrenPct != null ? t("neighborhood.parts.householdsWithChildren", { share: formatPct(cbs.shareHouseholdsWithChildrenPct, locale) }) : undefined,
    cbs?.primaryPupils != null ? t("neighborhood.parts.primaryPupils", { count: cbs.primaryPupils.toLocaleString(formatLocaleTag(locale)) }) : undefined,
    cbs?.secondaryPupils != null ? t("neighborhood.parts.secondaryPupils", { count: cbs.secondaryPupils.toLocaleString(formatLocaleTag(locale)) }) : undefined,
  ].filter(Boolean);
  const educationParts = educationFromSes
    ? [
      ses.educationLowPct != null ? t("neighborhood.parts.educationLow", { share: formatPct(ses.educationLowPct, locale) }) : undefined,
      ses.educationMidPct != null ? t("neighborhood.parts.educationMid", { share: formatPct(ses.educationMidPct, locale) }) : undefined,
      ses.educationHighPct != null ? t("neighborhood.parts.educationHigh", { share: formatPct(ses.educationHighPct, locale) }) : undefined,
    ].filter(Boolean)
    : [
      cbs?.primaryPupils != null ? t("neighborhood.parts.poPupils", { count: cbs.primaryPupils.toLocaleString(formatLocaleTag(locale)) }) : undefined,
      cbs?.secondaryPupils != null ? t("neighborhood.parts.voPupils", { count: cbs.secondaryPupils.toLocaleString(formatLocaleTag(locale)) }) : undefined,
      cbs?.mboStudents != null ? t("neighborhood.parts.mboStudents", { count: cbs.mboStudents.toLocaleString(formatLocaleTag(locale)) }) : undefined,
      cbs?.hboStudents != null ? t("neighborhood.parts.hboStudents", { count: cbs.hboStudents.toLocaleString(formatLocaleTag(locale)) }) : undefined,
      cbs?.woStudents != null ? t("neighborhood.parts.woStudents", { count: cbs.woStudents.toLocaleString(formatLocaleTag(locale)) }) : undefined,
    ].filter(Boolean);
  const crimeBits = [
    crime?.total != null ? t("neighborhood.parts.crimeTotal", { count: crime.total.toLocaleString(formatLocaleTag(locale)) }) : undefined,
    crime?.per1000 != null ? t("neighborhood.parts.crimePer1000", { rate: crime.per1000.toLocaleString(formatLocaleTag(locale), { maximumFractionDigits: 1 }) }) : undefined,
    crime?.burglary != null ? t("neighborhood.parts.crimeBurglary", { count: crime.burglary.toLocaleString(formatLocaleTag(locale)) }) : undefined,
    crime?.assault != null ? t("neighborhood.parts.crimeAssault", { count: crime.assault.toLocaleString(formatLocaleTag(locale)) }) : undefined,
  ].filter(Boolean);

  return [
    createSignal({
      key: "schools",
      label: t("neighborhood.schools.label"),
      category: "buurt",
      value: cbs?.primarySchoolDistanceKm != null ? formatKm(cbs.primarySchoolDistanceKm, locale) : cbs?.childcareDistanceKm != null ? formatKm(cbs.childcareDistanceKm, locale) : t("common.noData"),
      score: schoolScore,
      summary: schoolAvailable
        ? t("neighborhood.schools.summaryAvailable", { parts: schoolParts.join("; ") })
        : t("neighborhood.schools.noDataSummary"),
      action: t("neighborhood.schools.action"),
      raw: cbs?.primarySchoolDistanceKm != null ? { value: cbs.primarySchoolDistanceKm, unit: "km", metric: "CBS gemiddelde afstand basisschool" } : undefined,
      confidence: "medium",
      spatialScale,
      available: schoolAvailable,
      evidence: cbsEvidence,
    }),
    createSignal({
      key: "children",
      label: t("neighborhood.children.label"),
      category: "buurt",
      value: cbs?.shareAge0to15Pct != null ? formatPct(cbs.shareAge0to15Pct, locale) : cbs?.shareHouseholdsWithChildrenPct != null ? formatPct(cbs.shareHouseholdsWithChildrenPct, locale) : t("common.noData"),
      summary: childrenAvailable
        ? t("neighborhood.children.summaryAvailable", { parts: childrenParts.join("; ") })
        : t("neighborhood.children.noDataSummary"),
      action: t("neighborhood.children.action"),
      raw: cbs?.shareAge0to15Pct != null ? { value: cbs.shareAge0to15Pct, unit: "%", metric: "CBS aandeel 0 tot 15 jaar" } : undefined,
      confidence: "medium",
      spatialScale,
      available: childrenAvailable,
      evidence: cbsEvidence,
    }),
    createSignal({
      key: "education",
      label: t("neighborhood.education.label"),
      category: "buurt",
      value: ses?.educationHighPct != null ? t("neighborhood.parts.educationHigh", { share: formatPct(ses.educationHighPct, locale) }) : cbs?.primaryPupils != null ? t("neighborhood.parts.poPupils", { count: cbs.primaryPupils.toLocaleString(formatLocaleTag(locale)) }) : t("common.noData"),
      summary: educationAvailable
        ? educationFromSes
          ? t("neighborhood.education.summarySes", { year: ses?.periodYear ? t("common.yearSuffix", { year: ses.periodYear }) : "", parts: educationParts.join(", ") })
          : t("neighborhood.education.summaryPupils", { parts: educationParts.join(", ") })
        : t("neighborhood.education.noDataSummary"),
      action: t("neighborhood.education.action"),
      raw: ses?.educationHighPct != null ? { value: ses.educationHighPct, unit: "%", metric: "CBS SES-WOA aandeel hbo/wo" } : undefined,
      confidence: "medium",
      spatialScale: ses?.spatialScale ?? t("common.spatialBuurt"),
      available: educationAvailable,
      evidence: educationFromSes ? sesEvidence : cbsEvidence,
    }),
    createSignal({
      key: "ses",
      label: t("neighborhood.ses.label"),
      category: "buurt",
      value: ses?.sesScore != null ? formatSesScore(ses.sesScore, locale) : t("common.noData"),
      summary: ses?.sesScore != null
        ? t("neighborhood.ses.summaryAvailable", {
          score: formatSesScore(ses.sesScore, locale),
          year: ses.periodYear ? t("neighborhood.ses.yearSuffix", { year: ses.periodYear }) : "",
          breakdown: ses.wealthScore != null || ses.educationScore != null || ses.workScore != null
            ? t("neighborhood.ses.breakdown", {
              wealth: ses.wealthScore != null ? formatSesScore(ses.wealthScore, locale) : t("neighborhood.ses.na"),
              education: ses.educationScore != null ? formatSesScore(ses.educationScore, locale) : t("neighborhood.ses.na"),
              work: ses.workScore != null ? formatSesScore(ses.workScore, locale) : t("neighborhood.ses.na"),
            })
            : "",
        })
        : t("neighborhood.ses.noDataSummary"),
      action: t("neighborhood.ses.action"),
      raw: ses?.sesScore != null ? { value: ses.sesScore, unit: "SES-WOA", metric: "CBS gemiddelde totaalscore" } : undefined,
      confidence: "medium",
      spatialScale: ses?.spatialScale ?? t("common.spatialBuurt"),
      available: Boolean(ses),
      evidence: sesEvidence,
    }),
    createSignal({
      key: "crime",
      label: t("neighborhood.crime.label"),
      category: "buurt",
      value: crime?.per1000 != null ? t("neighborhood.crime.valuePer1000", { rate: crime.per1000.toLocaleString(formatLocaleTag(locale), { maximumFractionDigits: 1 }) }) : crime?.total != null ? crime.total.toLocaleString(formatLocaleTag(locale)) : t("common.noData"),
      score: crimeScore,
      summary: crime
        ? t("neighborhood.crime.summaryAvailable", {
          bits: crimeBits.join("; "),
          year: crime.periodYear ? t("common.yearSuffix", { year: crime.periodYear }) : "",
        })
        : t("neighborhood.crime.noDataSummary"),
      action: t("neighborhood.crime.action"),
      raw: crime?.per1000 != null ? { value: crime.per1000, unit: "per 1.000 inwoners", metric: "geregistreerde misdrijven" } : crime?.total != null ? { value: crime.total, unit: "aantal", metric: "geregistreerde misdrijven" } : undefined,
      confidence: "medium",
      spatialScale: crime?.spatialScale ?? t("common.spatialBuurt"),
      available: Boolean(crime),
      evidence: crimeEvidence,
    }),
  ];
}

export function placeNeighborhoodSignals(input: {
  cbs: CbsContext | null;
  ses: SesContext | null;
  crime: CrimeContext | null;
  cbsEvidence: ReturnType<typeof createCbsEvidence>;
  sesEvidence: ReturnType<typeof createSesEvidence>;
  crimeEvidence: ReturnType<typeof createCrimeEvidence>;
  spatialScale?: string;
}, locale: Locale = "nl"): Signal[] {
  const t = getLibTranslator(locale, "lib-analysis");
  const spatialScale = input.spatialScale ?? t("common.spatialBuurt");
  return [
    cbsContextSignal({ cbs: input.cbs, cbsEvidence: input.cbsEvidence, spatialScale }, locale),
    ...neighborhoodSignals({ ...input, spatialScale }, locale),
  ];
}
