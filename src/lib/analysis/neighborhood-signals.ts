import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { schoolScoreFromCbs, type CbsContext } from "@/src/lib/sources/cbs";
import { scoreSeverity } from "@/src/lib/scoring/score";
import { crimeScoreFromRatePer1000, type CrimeContext } from "@/src/lib/sources/politie";
import { type SesContext } from "@/src/lib/sources/ses";

function clamp(value: number, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

function formatKm(distanceKm: number) {
  return `${distanceKm.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
}

function formatPct(value: number) {
  return `${value.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}%`;
}

function formatSesScore(value: number) {
  return value.toLocaleString("nl-NL", { signDisplay: "exceptZero", maximumFractionDigits: 3 });
}

export function createCbsEvidence(cbs: CbsContext | null, sourceUrl: string): Evidence {
  return createEvidence({
    id: "cbs-buurtcontext",
    source: "CBS Wijk- en Buurtkaart",
    sourceUrl,
    confidence: "medium",
    fetchedAt: cbs?.fetchedAt,
    spatialResolution: "buurt",
    caveat: "Buurtgemiddelden zijn context en beschrijven niet één woning of huishouden.",
  });
}

export function createSesEvidence(ses: SesContext | null, sourceUrl: string): Evidence {
  return createEvidence({
    id: "cbs-ses-woa",
    source: "CBS SES-WOA",
    sourceUrl,
    sourceRecordId: ses?.regionCode,
    sourceUpdatedAt: ses?.periodYear,
    confidence: "medium",
    fetchedAt: ses?.fetchedAt,
    spatialResolution: ses?.spatialScale ?? "buurt",
    caveat: "SES-WOA is een buurtgemiddelde van welvaart, opleidingsniveau en arbeidsverleden; het beschrijft geen huishouden of woning.",
  });
}

export function createCrimeEvidence(crime: CrimeContext | null, sourceUrl: string): Evidence {
  return createEvidence({
    id: "politie-misdrijven",
    source: "Politie / CBS misdrijven",
    sourceUrl,
    sourceRecordId: crime?.regionCode,
    sourceUpdatedAt: crime?.periodYear,
    confidence: "medium",
    fetchedAt: crime?.fetchedAt,
    spatialResolution: crime?.spatialScale ?? "buurt",
    caveat: "Alleen bij de politie geregistreerde feiten; aangiftebereidheid verschilt per buurt.",
  });
}

export function cbsContextSignal(input: {
  cbs: CbsContext | null;
  cbsEvidence: Evidence;
  spatialScale?: string;
}): Signal {
  const { cbs, cbsEvidence, spatialScale = "buurt" } = input;
  const cbsAvailable = Boolean(cbs);
  return {
    key: "cbs-context",
    label: "Buurtvoorzieningen",
    category: "buurt",
    value: cbs?.buurtName ?? cbs?.municipalityName ?? "Geen data",
    score: cbs?.supermarketDistanceKm != null ? clamp(9 - cbs.supermarketDistanceKm * 1.5) : cbs ? 6 : undefined,
    severity: cbs ? scoreSeverity(cbs.supermarketDistanceKm != null ? clamp(9 - cbs.supermarketDistanceKm * 1.5) : 6) : "neutral",
    summary: cbs?.buurtName || cbs?.municipalityName
      ? `${cbs.buurtName ?? cbs.municipalityName}${cbs.buurtName && cbs.municipalityName ? ` (${cbs.municipalityName})` : ""}: gemiddelde afstand tot een grote supermarkt is ${cbs.supermarketDistanceKm != null ? formatKm(cbs.supermarketDistanceKm) : "onbekend"}${cbs.huisartsDistanceKm != null ? `, huisarts ${formatKm(cbs.huisartsDistanceKm)}` : ""}. Dit is geen woningwaardering.`
      : "Er is geen CBS-buurtcontext beschikbaar.",
    action: "Vergelijk buurtgemiddelden met je eigen leefstijl en controleer voorzieningen op verschillende tijdstippen.",
    raw: cbs?.supermarketDistanceKm != null ? { value: cbs.supermarketDistanceKm, unit: "km", metric: "CBS gemiddelde afstand supermarkt" } : undefined,
    confidence: "medium",
    spatialScale,
    evidence: [cbsEvidence],
    availability: cbsAvailable ? "available" : "unavailable",
  };
}

export function neighborhoodSignals(input: {
  cbs: CbsContext | null;
  ses: SesContext | null;
  crime: CrimeContext | null;
  cbsEvidence: Evidence;
  sesEvidence: Evidence;
  crimeEvidence: Evidence;
}): Signal[] {
  const { cbs, ses, crime, cbsEvidence, sesEvidence, crimeEvidence } = input;
  const schoolScore = cbs ? schoolScoreFromCbs(cbs) : undefined;
  const schoolAvailable = Boolean(cbs && (cbs.primarySchoolDistanceKm != null || cbs.childcareDistanceKm != null || cbs.secondarySchoolDistanceKm != null));
  const childrenAvailable = Boolean(cbs && (cbs.shareAge0to15Pct != null || cbs.shareHouseholdsWithChildrenPct != null || cbs.primaryPupils != null));
  const educationFromSes = ses && (ses.educationLowPct != null || ses.educationMidPct != null || ses.educationHighPct != null);
  const educationFromCbs = Boolean(cbs && (cbs.primaryPupils != null || cbs.secondaryPupils != null || cbs.mboStudents != null || cbs.hboStudents != null || cbs.woStudents != null));
  const educationAvailable = Boolean(educationFromSes || educationFromCbs);
  const crimeScore = crime?.per1000 != null ? crimeScoreFromRatePer1000(crime.per1000) : undefined;
  const schoolParts = [
    cbs?.primarySchoolDistanceKm != null ? `basisschool ${formatKm(cbs.primarySchoolDistanceKm)}` : undefined,
    cbs?.primarySchoolsWithin1km != null ? `gemiddeld ${cbs.primarySchoolsWithin1km.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} basisschool(len) binnen 1 km` : undefined,
    cbs?.secondarySchoolDistanceKm != null ? `voortgezet onderwijs ${formatKm(cbs.secondarySchoolDistanceKm)}` : undefined,
    cbs?.childcareDistanceKm != null ? `kinderdagverblijf ${formatKm(cbs.childcareDistanceKm)}` : undefined,
    cbs?.afterSchoolCareDistanceKm != null ? `BSO ${formatKm(cbs.afterSchoolCareDistanceKm)}` : undefined,
  ].filter(Boolean);
  const childrenParts = [
    cbs?.shareAge0to15Pct != null ? `${formatPct(cbs.shareAge0to15Pct)} van de inwoners is 0 tot 15 jaar` : undefined,
    cbs?.shareHouseholdsWithChildrenPct != null ? `${formatPct(cbs.shareHouseholdsWithChildrenPct)} van de huishoudens heeft kinderen` : undefined,
    cbs?.primaryPupils != null ? `${cbs.primaryPupils.toLocaleString("nl-NL")} leerlingen in het primair onderwijs wonen in deze buurt` : undefined,
    cbs?.secondaryPupils != null ? `${cbs.secondaryPupils.toLocaleString("nl-NL")} in het voortgezet onderwijs` : undefined,
  ].filter(Boolean);
  const educationParts = educationFromSes
    ? [
      ses.educationLowPct != null ? `${formatPct(ses.educationLowPct)} basisonderwijs/vmbo/mbo1` : undefined,
      ses.educationMidPct != null ? `${formatPct(ses.educationMidPct)} havo/vwo/mbo2-4` : undefined,
      ses.educationHighPct != null ? `${formatPct(ses.educationHighPct)} hbo/wo` : undefined,
    ].filter(Boolean)
    : [
      cbs?.primaryPupils != null ? `${cbs.primaryPupils.toLocaleString("nl-NL")} PO-leerlingen` : undefined,
      cbs?.secondaryPupils != null ? `${cbs.secondaryPupils.toLocaleString("nl-NL")} VO-leerlingen` : undefined,
      cbs?.mboStudents != null ? `${cbs.mboStudents.toLocaleString("nl-NL")} mbo-studenten` : undefined,
      cbs?.hboStudents != null ? `${cbs.hboStudents.toLocaleString("nl-NL")} hbo-studenten` : undefined,
      cbs?.woStudents != null ? `${cbs.woStudents.toLocaleString("nl-NL")} wo-studenten` : undefined,
    ].filter(Boolean);
  const crimeBits = [
    crime?.total != null ? `${crime.total.toLocaleString("nl-NL")} geregistreerde misdrijven` : undefined,
    crime?.per1000 != null ? `${crime.per1000.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} per 1.000 inwoners` : undefined,
    crime?.burglary != null ? `${crime.burglary.toLocaleString("nl-NL")} woninginbraken` : undefined,
    crime?.assault != null ? `${crime.assault.toLocaleString("nl-NL")} mishandelingen` : undefined,
  ].filter(Boolean);

  return [
    {
      key: "schools",
      label: "Scholen en opvang",
      category: "buurt",
      value: cbs?.primarySchoolDistanceKm != null ? formatKm(cbs.primarySchoolDistanceKm) : cbs?.childcareDistanceKm != null ? formatKm(cbs.childcareDistanceKm) : "Geen data",
      score: schoolScore,
      severity: schoolScore != null ? scoreSeverity(schoolScore) : "neutral",
      summary: schoolAvailable
        ? `CBS-buurtgemiddelde: ${schoolParts.join("; ")}. Dit is de gemiddelde afstand over de weg voor alle inwoners van de buurt, geen loopafstand vanaf dit adres.`
        : "Er zijn geen CBS-afstanden tot scholen of opvang beschikbaar.",
      action: "Loop of fiets de schoolroute op een schooldag; vraag naar wachtlijsten en of de school van je voorkeur in het voedingsgebied ligt.",
      raw: cbs?.primarySchoolDistanceKm != null ? { value: cbs.primarySchoolDistanceKm, unit: "km", metric: "CBS gemiddelde afstand basisschool" } : undefined,
      confidence: "medium",
      spatialScale: "buurt",
      evidence: [cbsEvidence],
      availability: schoolAvailable ? "available" : "unavailable",
    },
    {
      key: "children",
      label: "Kinderen in de buurt",
      category: "buurt",
      value: cbs?.shareAge0to15Pct != null ? formatPct(cbs.shareAge0to15Pct) : cbs?.shareHouseholdsWithChildrenPct != null ? formatPct(cbs.shareHouseholdsWithChildrenPct) : "Geen data",
      severity: "neutral",
      summary: childrenAvailable
        ? `${childrenParts.join("; ")}. Dit beschrijft de bevolkingssamenstelling, niet of de buurt 'geschikt' is.`
        : "Er zijn geen CBS-cijfers over kinderen in deze buurt.",
      action: "Kijk zelf op een schooldag en in het weekend hoe de straat aanvoelt; cijfers zeggen niets over speelplekken of overlast.",
      raw: cbs?.shareAge0to15Pct != null ? { value: cbs.shareAge0to15Pct, unit: "%", metric: "CBS aandeel 0 tot 15 jaar" } : undefined,
      confidence: "medium",
      spatialScale: "buurt",
      evidence: [cbsEvidence],
      availability: childrenAvailable ? "available" : "unavailable",
    },
    {
      key: "education",
      label: "Opleiding in de wijk",
      category: "buurt",
      value: ses?.educationHighPct != null ? `${formatPct(ses.educationHighPct)} hbo/wo` : cbs?.primaryPupils != null ? `${cbs.primaryPupils.toLocaleString("nl-NL")} PO-leerlingen` : "Geen data",
      severity: "neutral",
      summary: educationAvailable
        ? educationFromSes
          ? `Hoogst behaalde opleiding van huishoudens${ses?.periodYear ? ` (${ses.periodYear})` : ""}: ${educationParts.join(", ")}. Dit is een buurtgemiddelde, geen oordeel over de woning.`
          : `Leerlingen en studenten woonachtig in de buurt: ${educationParts.join(", ")}. Dat zegt waar zij wonen, niet waar zij naar school gaan.`
        : "Er is geen opleidingsverdeling of leerlingenaantal beschikbaar voor deze buurt.",
      action: "Gebruik dit alleen als context. Het zegt niets over schoolkwaliteit; check scholen zelf via scholenopdekaart.nl.",
      raw: ses?.educationHighPct != null ? { value: ses.educationHighPct, unit: "%", metric: "CBS SES-WOA aandeel hbo/wo" } : undefined,
      confidence: "medium",
      spatialScale: ses?.spatialScale ?? "buurt",
      evidence: educationFromSes ? [sesEvidence] : [cbsEvidence],
      availability: educationAvailable ? "available" : "unavailable",
    },
    {
      key: "ses",
      label: "Sociaal-economische status",
      category: "buurt",
      value: ses?.sesScore != null ? formatSesScore(ses.sesScore) : "Geen data",
      severity: "neutral",
      summary: ses?.sesScore != null
        ? `Officiële CBS SES-WOA-totaalscore ${formatSesScore(ses.sesScore)} (Nederland ≈ 0)${ses.periodYear ? `, verslagjaar ${ses.periodYear}` : ""}${ses.wealthScore != null || ses.educationScore != null || ses.workScore != null ? `: welvaart ${ses.wealthScore != null ? formatSesScore(ses.wealthScore) : "n.v.t."}, opleiding ${ses.educationScore != null ? formatSesScore(ses.educationScore) : "n.v.t."}, arbeidsverleden ${ses.workScore != null ? formatSesScore(ses.workScore) : "n.v.t."}` : ""}. Dit is geen woningwaardering en geen 'betere buurt'-oordeel.`
        : "Er is geen SES-WOA-score beschikbaar voor deze buurt.",
      action: "Lees SES-WOA als achtergrond over welvaart, opleiding en werk in de buurt; het voorspelt niets over jouw buren of de staat van deze woning.",
      raw: ses?.sesScore != null ? { value: ses.sesScore, unit: "SES-WOA", metric: "CBS gemiddelde totaalscore" } : undefined,
      confidence: "medium",
      spatialScale: ses?.spatialScale ?? "buurt",
      evidence: [sesEvidence],
      availability: ses ? "available" : "unavailable",
    },
    {
      key: "crime",
      label: "Geregistreerde misdrijven",
      category: "buurt",
      value: crime?.per1000 != null ? `${crime.per1000.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 1.000` : crime?.total != null ? crime.total.toLocaleString("nl-NL") : "Geen data",
      score: crimeScore,
      severity: crimeScore != null ? scoreSeverity(crimeScore) : "neutral",
      summary: crime
        ? `${crimeBits.join("; ")}${crime.periodYear ? ` (${crime.periodYear})` : ""}. Alleen bij de politie geregistreerde feiten, inclusief pogingen.`
        : "Er zijn geen politiecijfers over geregistreerde misdrijven beschikbaar voor deze buurt.",
      action: "Bekijk de uitsplitsing en meer jaren op data.politie.nl; cijfers hangen af van aangiftebereidheid en zeggen niets over jouw woning.",
      raw: crime?.per1000 != null ? { value: crime.per1000, unit: "per 1.000 inwoners", metric: "geregistreerde misdrijven" } : crime?.total != null ? { value: crime.total, unit: "aantal", metric: "geregistreerde misdrijven" } : undefined,
      confidence: "medium",
      spatialScale: crime?.spatialScale ?? "buurt",
      evidence: [crimeEvidence],
      availability: crime ? "available" : "unavailable",
    },
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
}): Signal[] {
  const spatialScale = input.spatialScale ?? "buurt";
  return [
    cbsContextSignal({ cbs: input.cbs, cbsEvidence: input.cbsEvidence, spatialScale }),
    ...neighborhoodSignals(input),
  ];
}
