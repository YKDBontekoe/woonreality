import type { Analysis, EverydayInsight, Evidence, Property, Signal } from "@/src/lib/types";
import { getBgtContext, pdokUrls, type BgtContext } from "@/src/lib/sources/pdok/bgt";
import { getEnergyLabel, epOnlineUrl } from "@/src/lib/sources/ep-online";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { distanceToGeometryM, geometryAreaM2 } from "@/src/lib/geo/measure";
import { calculateOverallScore, componentFromSignal, SCORING_VERSION, scoreSeverity } from "@/src/lib/scoring/score";
import { getNearbyProperties } from "@/src/lib/sources/pdok/bag";
import { getRivmContext, rivmUrls, type RivmContext } from "@/src/lib/sources/rivm";
import { getCbsContext, cbsBuurtenUrl, type CbsContext } from "@/src/lib/sources/cbs";
import { getNdovContext, ndovHaltesUrl, type NdovContext } from "@/src/lib/sources/ndov";
import { getDsoContext, dsoOnderwerpenUrl, type DsoContext } from "@/src/lib/sources/dso";

const ANALYSIS_VERSION = "2026.08.v0";

function clamp(value: number, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

function formatDistance(distance: number) {
  if (!Number.isFinite(distance)) return "meer dan 250 m";
  return distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
}

function identityEvidence(property: Property): Evidence {
  return createEvidence({
    id: `bag-${property.bagVboId}`,
    source: "PDOK / BAG",
    sourceUrl: pdokUrls.bag,
    sourceRecordId: property.bagVboId,
    confidence: "high",
    spatialResolution: "BAG-object",
    caveat: "BAG is de objectidentiteit; een adreslabel kan in de tijd wijzigen.",
  });
}

export async function analyzeProperty(property: Property): Promise<Analysis> {
  let bgt: BgtContext = { roads: [], greenAreas: [], water: [], fetchedAt: new Date().toISOString() };
  let bgtAvailable = true;
  try {
    bgt = await getBgtContext(property.coordinates);
  } catch (error) {
    bgtAvailable = false;
    console.warn("BGT unavailable; returning BAG-only analysis", error);
  }
  let nearbyProperties: Analysis["nearbyProperties"] = [];
  let nearbyAvailable = true;
  try {
    nearbyProperties = await getNearbyProperties(property);
  } catch (error) {
    nearbyAvailable = false;
    console.warn("Nearby BAG properties unavailable", error);
  }
  let energy: Awaited<ReturnType<typeof getEnergyLabel>> = null;
  let energyAvailable = false;
  try {
    energy = await getEnergyLabel(property);
    energyAvailable = Boolean(energy?.Energieklasse);
  } catch (error) {
    console.warn("EP-Online unavailable; continuing without energy label", error);
  }
  const [rivmResult, cbsResult, ndovResult, dsoResult] = await Promise.allSettled([
    getRivmContext(property.coordinates),
    getCbsContext(property.coordinates),
    getNdovContext(property.coordinates),
    getDsoContext(property.coordinates),
  ]);
  const rivm: RivmContext | null = rivmResult.status === "fulfilled" ? rivmResult.value : null;
  const cbs: CbsContext | null = cbsResult.status === "fulfilled" ? cbsResult.value : null;
  const ndov: NdovContext | null = ndovResult.status === "fulfilled" ? ndovResult.value : null;
  const dso: DsoContext | null = dsoResult.status === "fulfilled" ? dsoResult.value : null;
  if (rivmResult.status === "rejected") console.warn("RIVM unavailable", rivmResult.reason);
  if (cbsResult.status === "rejected") console.warn("CBS buurtcontext unavailable", cbsResult.reason);
  if (ndovResult.status === "rejected") console.warn("NDOV haltes unavailable", ndovResult.reason);
  if (dsoResult.status === "rejected") console.warn("DSO onderwerpen unavailable", dsoResult.reason);
  const origin = property.coordinates;
  const greenAreaM2 = bgt.greenAreas.reduce((sum, feature) => sum + geometryAreaM2(feature.geometry, origin), 0);
  const searchAreaM2 = Math.PI * 250 ** 2;
  const greenPercent = clamp((greenAreaM2 / searchAreaM2) * 100, 0, 100);
  const nearestRoadM = bgt.roads.length
    ? Math.min(...bgt.roads.map((feature) => distanceToGeometryM(origin, feature.geometry)))
    : Number.POSITIVE_INFINITY;

  const identity = identityEvidence(property);
  const bgtRoadEvidence = createEvidence({
    id: "bgt-roads",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/wegdeel/items`,
    confidence: "medium",
    spatialResolution: "lokale topografie",
    caveat: "De BGT-proxy zegt iets over lokale wegstructuur, niet over een officiële gevelmeting of verkeersmodel.",
  });
  const bgtGreenEvidence = createEvidence({
    id: "bgt-green",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/begroeidterreindeel/items`,
    confidence: "medium",
    spatialResolution: "lokale topografie",
    caveat: "Groenpercentage is een eerste geometrische indicatie binnen circa 250 meter.",
  });
  const energyEvidence = createEvidence({
    id: "ep-online-energy",
    source: "EP-Online / RVO",
    sourceUrl: epOnlineUrl,
    sourceRecordId: property.bagVboId,
    confidence: "high",
    spatialResolution: "BAG-verblijfsobject",
    caveat: "Een energielabel zegt niets over de actuele staat of het werkelijke verbruik van de woning.",
  });
  const rivmAvailable = Boolean(rivm && (rivm.noiseLden != null || rivm.no2 != null || rivm.pm25 != null));
  const rivmMetricCount = [rivm?.noiseLden, rivm?.no2, rivm?.pm25].filter((value) => value != null).length;
  const cbsAvailable = Boolean(cbs);
  const ndovAvailable = Boolean(ndov);
  const dsoAvailable = Boolean(dso);
  const rivmEvidence = createEvidence({
    id: "rivm-air-noise",
    source: "RIVM geo-services",
    sourceUrl: rivmUrls.noise,
    confidence: "medium",
    spatialResolution: "RIVM rastercel",
    caveat: "RIVM-waarden zijn model- of rasterwaarden; gevel, verdieping en momentane omstandigheden kunnen afwijken.",
  });
  const cbsEvidence = createEvidence({
    id: "cbs-buurtcontext",
    source: "CBS Wijk- en Buurtkaart",
    sourceUrl: cbsBuurtenUrl,
    confidence: "medium",
    spatialResolution: "buurt",
    caveat: "Buurtgemiddelden zijn context en beschrijven niet één woning of huishouden.",
  });
  const ndovEvidence = createEvidence({
    id: "ndov-haltes",
    source: "NDOV haltes",
    sourceUrl: ndovHaltesUrl,
    confidence: "high",
    spatialResolution: "haltecoördinaat",
    caveat: "Een nabijgelegen halte zegt niets over frequentie, reistijd of toegankelijkheid van de specifieke lijn.",
  });
  const dsoEvidence = createEvidence({
    id: "dso-onderwerpen",
    source: "DSO Omgevingsdocumenten",
    sourceUrl: dsoOnderwerpenUrl,
    confidence: "medium",
    spatialResolution: "puntbevraging",
    caveat: "De DSO-bevraging signaleert relevante onderwerpen; controleer de actuele regeling en kaartlagen voor juridische conclusies.",
  });

  const noiseScore = rivm?.noiseLden != null
    ? clamp(10 - Math.max(0, rivm.noiseLden - 35) / 4)
    : clamp(nearestRoadM === Infinity ? 8 : 8 - Math.max(0, 120 - nearestRoadM) / 25);
  const greenScore = clamp(4 + greenPercent / 8);
  const heatScore = clamp(9 - (100 - greenPercent) / 18);
  const contextScore = clamp(property.buildingYear ? 6.5 + (property.buildingYear >= 2000 ? 1 : 0) : 6);

  const signals: Signal[] = [
    {
      key: "noise",
      label: "Geluidsscreening",
      category: "gezondheid",
      value: Math.round((noiseScore * 10) / 10),
      unit: "/ 10",
      score: noiseScore,
      severity: scoreSeverity(noiseScore),
      summary: rivm?.noiseLden != null
        ? `RIVM-modelwaarde voor wegverkeersgeluid is ${rivm.noiseLden.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} dB Lden.`
        : nearestRoadM === Infinity
          ? "Binnen de eerste zoekbuffer is geen BGT-wegdeel gevonden."
          : `Dichtstbijzijnde BGT-wegdeel ligt op ongeveer ${formatDistance(nearestRoadM)}.`,
      action: "Luister tijdens de avondspits met ramen open én dicht; dit is geen officiële geluidmeting.",
      raw: rivm?.noiseLden != null
        ? { value: rivm.noiseLden, unit: "dB Lden", metric: "RIVM wegverkeersgeluid" }
        : { value: Math.round(nearestRoadM), unit: "m", metric: "afstand tot dichtstbijzijnde BGT-wegdeel" },
      confidence: "medium",
      spatialScale: rivm?.noiseLden != null ? "RIVM rastercel" : "circa 250 m zoekbuffer",
      evidence: rivm?.noiseLden != null ? [rivmEvidence] : [bgtRoadEvidence],
      availability: rivm?.noiseLden != null || bgtAvailable ? "available" : "unavailable",
    },
    {
      key: "green",
      label: "Groen",
      category: "klimaat",
      value: `${Math.round(greenPercent)}%`,
      score: greenScore,
      severity: scoreSeverity(greenScore),
      summary: `Ongeveer ${Math.round(greenPercent)}% van de lokale BGT-oppervlakken is als begroeid terrein geregistreerd.`,
      action: "Check bij een bezichtiging ook de boomkroon, privacy en het groen dat je daadwerkelijk vanuit de woning ziet.",
      raw: { value: Math.round(greenPercent), unit: "%", metric: "BGT-begroeid terrein binnen circa 250 m" },
      confidence: "medium",
      spatialScale: "circa 250 m zoekbuffer",
      evidence: [bgtGreenEvidence],
      availability: bgtAvailable ? "available" : "unavailable",
    },
    {
      key: "heat",
      label: "Verstening & hitte",
      category: "klimaat",
      value: Math.round(heatScore * 10) / 10,
      unit: "/ 10",
      score: heatScore,
      severity: scoreSeverity(heatScore),
      summary: `De eerste groen/verharding-proxy komt uit op ${Math.round(greenPercent)}% groen in de zoekbuffer.`,
      action: "Kijk op een hete dag naar schaduw, geveloriëntatie en de hoeveelheid verharding rond tuin en straat.",
      raw: { value: Math.round(100 - greenPercent), unit: "% verhardingsproxy", metric: "afgeleid uit BGT" },
      confidence: "low",
      spatialScale: "circa 250 m zoekbuffer",
      evidence: [bgtGreenEvidence],
      availability: bgtAvailable ? "available" : "unavailable",
    },
    {
      key: "access",
      label: "Lokale wegstructuur",
      category: "mobiliteit",
      value: `${bgt.roads.length} wegdelen`,
      severity: "neutral",
      summary: `${bgt.roads.length} BGT-wegdelen zijn in de eerste zoekbuffer aangetroffen; dit beschrijft de straatstructuur, geen bereikbaarheid.`,
      action: "Controleer looproutes, scholen, OV en dagelijkse voorzieningen; deze eerste indicatie meet die niet.",
      confidence: "medium",
      spatialScale: "circa 250 m zoekbuffer",
      evidence: [bgtRoadEvidence],
      availability: bgtAvailable ? "available" : "unavailable",
    },
    {
      key: "context",
      label: "BAG-context",
      category: "woning",
      value: property.buildingYear ? String(property.buildingYear) : "bekend",
      unit: property.buildingYear ? "bouwjaar" : undefined,
      score: contextScore,
      severity: "neutral",
      summary: property.areaM2
        ? `BAG koppelt dit adres aan een verblijfsobject van ${property.areaM2} m².`
        : "BAG koppelt dit adres aan een verblijfsobject.",
      action: "Gebruik dit als startpunt; een bouwkundige keuring blijft nodig voor de staat van het gebouw.",
      confidence: "high",
      spatialScale: "BAG-verblijfsobject",
      evidence: [identity],
      availability: "available",
    },
    {
      key: "energy",
      label: "Energielabel",
      category: "woning",
      value: energy?.Energieklasse ?? "Geen data",
      score: energy?.Energieklasse ? energyScore(energy.Energieklasse) : undefined,
      severity: energy?.Energieklasse ? scoreSeverity(energyScore(energy.Energieklasse)) : "neutral",
      summary: energy?.Energieklasse ? `Geregistreerd energielabel ${energy.Energieklasse}.` : "Er is geen energielabel beschikbaar in deze analyse.",
      action: "Vraag naar de originele labelstukken en recente verbeteringen aan isolatie, glas en installaties.",
      confidence: "high",
      spatialScale: "BAG-verblijfsobject",
      availability: energyAvailable ? "available" : "unavailable",
      evidence: [energyEvidence],
    },
    {
      key: "air",
      label: "Luchtkwaliteit",
      category: "gezondheid",
      value: rivm?.no2 != null ? `${rivm.no2.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} µg/m³ NO₂` : rivm?.pm25 != null ? `${rivm.pm25.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} µg/m³ PM₂·₅` : "Geen data",
      score: rivm?.no2 != null ? clamp(10 - Math.max(0, rivm.no2 - 10) / 3) : rivm?.pm25 != null ? clamp(10 - Math.max(0, rivm.pm25 - 5) / 2) : undefined,
      severity: rivm?.no2 != null || rivm?.pm25 != null ? scoreSeverity(rivm?.no2 != null ? clamp(10 - Math.max(0, rivm.no2 - 10) / 3) : clamp(10 - Math.max(0, (rivm?.pm25 ?? 5) - 5) / 2)) : "neutral",
      summary: rivm?.no2 != null ? `RIVM rapporteert ${rivm.no2.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} µg/m³ jaargemiddelde NO₂.` : rivm?.pm25 != null ? `RIVM rapporteert ${rivm.pm25.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} µg/m³ PM₂·₅.` : "Er is geen RIVM-luchtkwaliteitswaarde beschikbaar.",
      action: "Gebruik de waarde als buurtindicatie; ventilatie, verkeer op straatniveau en binnenlucht bepalen je werkelijke blootstelling.",
      raw: rivm?.no2 != null ? { value: rivm.no2, unit: "µg/m³", metric: "RIVM jaargemiddelde NO₂" } : rivm?.pm25 != null ? { value: rivm.pm25, unit: "µg/m³", metric: "RIVM jaargemiddelde PM₂·₅" } : undefined,
      confidence: "medium",
      spatialScale: "RIVM rastercel",
      evidence: [rivmEvidence],
      availability: rivm?.no2 != null || rivm?.pm25 != null ? "available" : "unavailable",
    },
    {
      key: "cbs-context",
      label: "Buurtcontext",
      category: "toekomst",
      value: cbs?.buurtName ?? "Geen data",
      score: cbs?.supermarketDistanceKm != null ? clamp(9 - cbs.supermarketDistanceKm * 1.5) : cbs ? 6 : undefined,
      severity: cbs ? scoreSeverity(cbs.supermarketDistanceKm != null ? clamp(9 - cbs.supermarketDistanceKm * 1.5) : 6) : "neutral",
      summary: cbs?.buurtName ? `${cbs.buurtName}${cbs.municipalityName ? ` (${cbs.municipalityName})` : ""} geeft buurtcontext voor voorzieningen en woningwaarde.` : "Er is geen CBS-buurtcontext beschikbaar.",
      action: "Vergelijk buurtgemiddelden met je eigen leefstijl en controleer voorzieningen op verschillende tijdstippen.",
      raw: cbs?.supermarketDistanceKm != null ? { value: cbs.supermarketDistanceKm, unit: "km", metric: "CBS gemiddelde afstand supermarkt" } : undefined,
      confidence: "medium",
      spatialScale: "buurt",
      evidence: [cbsEvidence],
      availability: cbsAvailable ? "available" : "unavailable",
    },
    {
      key: "transit",
      label: "OV-haltes",
      category: "mobiliteit",
      value: ndov?.nearestDistanceM != null ? `${Math.round(ndov.nearestDistanceM / 10) * 10} m` : ndov ? "Geen halte < 1 km" : "Geen data",
      score: ndov?.nearestDistanceM != null ? clamp(10 - ndov.nearestDistanceM / 150) : ndov ? 3 : undefined,
      severity: ndov ? scoreSeverity(ndov.nearestDistanceM != null ? clamp(10 - ndov.nearestDistanceM / 150) : 3) : "neutral",
      summary: ndov?.nearestDistanceM != null ? `Dichtstbijzijnde NDOV-halte ligt op circa ${formatDistance(ndov.nearestDistanceM)}; ${ndov.stopCount} halte(n) binnen 1 km.` : ndov ? "Geen NDOV-halte binnen 1 kilometer gevonden." : "De NDOV-haltecatalogus kon niet worden opgehaald.",
      action: "Controleer lijnfrequentie, avondritten en de daadwerkelijke looproute vanaf de voordeur.",
      raw: ndov?.nearestDistanceM != null ? { value: Math.round(ndov.nearestDistanceM), unit: "m", metric: "afstand tot dichtstbijzijnde NDOV-halte" } : undefined,
      confidence: "high",
      spatialScale: "haltecoördinaat",
      evidence: [ndovEvidence],
      availability: ndovAvailable ? "available" : "unavailable",
    },
    {
      key: "future",
      label: "Omgevingsontwikkelingen",
      category: "toekomst",
      value: dso ? `${dso.topicCount} onderwerpen` : "Geen data",
      score: dso ? clamp(7 - Math.min(3, dso.topicCount / 10)) : undefined,
      severity: dso ? "neutral" : "neutral",
      summary: dso ? `${dso.topicCount} DSO-onderwerp(en) raken deze locatie${dso.topicNames.length ? `, waaronder ${dso.topicNames.join(", ")}` : ""}.` : "Er is geen DSO-onderwerpenbevraging beschikbaar.",
      action: "Open de relevante omgevingsdocumenten en controleer status, besluitdatum en kaartbegrenzing voordat je conclusies trekt.",
      confidence: "medium",
      spatialScale: "puntbevraging",
      evidence: [dsoEvidence],
      availability: dsoAvailable ? "available" : "unavailable",
    },
  ];

  // Only signals with an actual score contribute. Descriptive context, such as
  // BGT road segments, remains useful to show but must not imply a score.
  const components = signals.filter((signal) => signal.availability !== "unavailable" && typeof signal.score === "number").map((signal) => componentFromSignal(
    signal,
    signal.key,
    signal.label,
    signal.summary,
  ));
  const evidence = [
    identity,
    bgtRoadEvidence,
    bgtGreenEvidence,
    ...(energyAvailable ? [energyEvidence] : []),
    ...(rivmAvailable ? [rivmEvidence] : []),
    ...(cbsAvailable ? [cbsEvidence] : []),
    ...(ndovAvailable ? [ndovEvidence] : []),
    ...(dsoAvailable ? [dsoEvidence] : []),
  ];
  const categoryLabels = {
    woning: "Woning",
    gezondheid: "Gezondheid & hinder",
    klimaat: "Klimaat & bodem",
    mobiliteit: "Mobiliteit",
    toekomst: "Toekomst",
  } as const;
  const domains = Object.entries(categoryLabels).map(([key, label]) => {
    const domainSignals = signals.filter((signal) => signal.category === key);
    const availableSignals = domainSignals.filter((signal) => signal.availability !== "unavailable" && typeof signal.score === "number");
    const score = availableSignals.length
      ? Math.round((availableSignals.reduce((sum, signal) => sum + (signal.score ?? 0), 0) / availableSignals.length) * 10) / 10
      : null;
    return {
      key: key as keyof typeof categoryLabels,
      label,
      score,
      signalKeys: domainSignals.map((signal) => signal.key),
      available: availableSignals.length > 0,
      summary: score == null ? "Voor dit domein is nu geen betrouwbare bron beschikbaar." : `Gemiddelde indicatie ${score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10.`,
    };
  });
  const availableSignals = signals.filter((signal) => signal.availability !== "unavailable");
  const highlights = availableSignals
    .filter((signal) => (signal.score ?? 5) < 5.5)
    .sort((a, b) => (a.score ?? 5) - (b.score ?? 5))
    .slice(0, 3)
    .map((signal) => ({ type: "attention" as const, signalKey: signal.key, text: signal.summary }));
  const positives = availableSignals
    .filter((signal) => (signal.score ?? 5) >= 6.5)
    .sort((a, b) => (b.score ?? 5) - (a.score ?? 5))
    .slice(0, 3)
    .map((signal) => ({ type: "positive" as const, signalKey: signal.key, text: signal.summary }));
  const availableDomainCount = domains.filter((domain) => domain.available).length;
  const signal = (key: string) => signals.find((item) => item.key === key && item.availability !== "unavailable");
  const scoreOf = (key: string) => signal(key)?.score;
  const insights: EverydayInsight[] = [];
  const noiseSignalScore = scoreOf("noise");
  const greenSignalScore = scoreOf("green");
  if (noiseSignalScore != null || greenSignalScore != null) {
    const tone = (noiseSignalScore ?? 5) < 5.5 ? "attention" : (greenSignalScore ?? 5) >= 6.5 ? "good" : "neutral";
    insights.push({
      title: "Hoe voelt de straat waarschijnlijk?",
      summary: (noiseSignalScore ?? 5) < 5.5
        ? "De directe wegcontext vraagt om een extra luistermoment. Plan je bezichtiging op een druk én rustig tijdstip; het aanwezige groen verandert dat niet automatisch."
        : (greenScore ?? 5) >= 6.5
          ? "De combinatie van lokale groenstructuur en wegcontext wijst op een prettiger straatbeeld. Check tijdens de bezichtiging nog wel geluid met open ramen."
          : "De openbare data geven geen uitgesproken straatbeeld. Kijk bij de bezichtiging bewust naar geluid, schaduw en de ruimte rondom de woning.",
      tone,
      signalKeys: ["noise", "green"].filter((key) => Boolean(signal(key))),
    });
  }
  const energyScoreValue = scoreOf("energy");
  const heatSignalScore = scoreOf("heat");
  if (energyScoreValue != null || heatSignalScore != null) {
    const tone = (energyScoreValue ?? 5) < 5.5 || (heatSignalScore ?? 5) < 5.5 ? "attention" : (energyScoreValue ?? 5) >= 6.5 && (heatSignalScore ?? 5) >= 6.5 ? "good" : "neutral";
    insights.push({
      title: "Comfort en energierekening",
      summary: (energyScoreValue ?? 5) < 5.5
        ? "De energiedata verdienen extra aandacht. Vraag naar verbruik, isolatie, ventilatie en wat al is verbeterd—dat zegt meer over je maandlasten dan een label alleen."
        : (heatSignalScore ?? 5) < 5.5
          ? "De woning kan prima presteren in de winter, maar de omgevingsindicatie vraagt aandacht voor warmte in de zomer. Vraag naar zonwering en ventilatie."
          : "Energie- en omgevingssignalen geven geen directe rode vlag. Vraag alsnog om recente energiekosten en test ventilatie tijdens de bezichtiging.",
      tone,
      signalKeys: ["energy", "heat"].filter((key) => Boolean(signal(key))),
    });
  }
  const transitScore = scoreOf("transit");
  const accessScore = scoreOf("access");
  if (transitScore != null || accessScore != null) {
    const tone = Math.min(transitScore ?? 5, accessScore ?? 5) >= 6.5 ? "good" : Math.min(transitScore ?? 5, accessScore ?? 5) < 5.5 ? "attention" : "neutral";
    insights.push({
      title: "Je dagelijkse route",
      summary: tone === "good" ? "De bereikbaarheidssignalen zijn gunstig voor dagelijkse verplaatsingen. Probeer je eigen woon-werkroute wel rond jouw vertrektijd." : "De route naar voorzieningen of vervoer is niet eenduidig gunstig. Check je eigen fiets-, auto- en ov-route voordat je beslist.",
      tone,
      signalKeys: ["transit", "access"].filter((key) => Boolean(signal(key))),
    });
  }

  return {
    property,
    overallScore: calculateOverallScore(components),
    analysisVersion: ANALYSIS_VERSION,
    scoringVersion: SCORING_VERSION,
    signals,
    components,
    evidence,
    generatedAt: new Date().toISOString(),
    sources: [
      "PDOK Location API",
      "PDOK BAG",
      ...(bgtAvailable ? ["PDOK BGT"] : []),
      ...(energyAvailable ? ["EP-Online / RVO"] : []),
      ...(rivmAvailable ? ["RIVM geo-services"] : []),
      ...(cbsAvailable ? ["CBS Wijk- en Buurtkaart"] : []),
      ...(ndovAvailable ? ["NDOV haltes"] : []),
      ...(dsoAvailable ? ["DSO Omgevingsdocumenten"] : []),
    ],
    domains,
    everydayInsights: insights,
    highlights: [...highlights, ...positives],
    dataCoverage: { available: availableDomainCount, total: domains.length, label: `${availableDomainCount} van ${domains.length} domeinen beschikbaar` },
    sourceStatuses: [
      { source: "PDOK / BAG", status: "ok" },
      { source: "PDOK / BGT", status: bgtAvailable ? "ok" : "unavailable", message: bgtAvailable ? undefined : "Lokale topografie kon niet worden opgehaald." },
      { source: "PDOK / BAG omgeving", status: nearbyAvailable ? "ok" : "unavailable", message: nearbyAvailable ? undefined : "Nabije adressen konden niet worden opgehaald." },
      { source: "EP-Online / RVO", status: energyAvailable ? "ok" : "unavailable", message: energyAvailable ? undefined : "Voeg EPONLINE_API_KEY toe voor energielabels." },
      { source: "RIVM geo-services", status: rivmMetricCount === 3 ? "ok" : rivmMetricCount > 0 ? "partial" : "unavailable", message: rivmAvailable ? undefined : "RIVM-rasterwaarden konden niet worden opgehaald." },
      { source: "CBS Wijk- en Buurtkaart", status: cbsAvailable ? "ok" : "unavailable", message: cbsAvailable ? undefined : "Geen CBS-buurtfeature gevonden of bron niet bereikbaar." },
      { source: "NDOV haltes", status: ndovAvailable ? "ok" : "unavailable", message: ndovAvailable ? undefined : "Voeg geen sleutel toe: de openbare haltecatalogus kon niet worden opgehaald." },
      { source: "DSO Omgevingsdocumenten", status: dsoAvailable ? "ok" : "unavailable", message: dsoAvailable ? undefined : "Voeg DSO_API_KEY toe voor ruimtelijke onderwerpen." },
    ],
    nearbyProperties,
  };
}

function energyScore(label: string) {
  const normalized = label.toUpperCase().replace("PLUS", "+");
  if (normalized.startsWith("A++++")) return 10;
  if (normalized.startsWith("A+++")) return 9.7;
  if (normalized.startsWith("A++")) return 9.4;
  if (normalized.startsWith("A+")) return 9.1;
  if (normalized.startsWith("A")) return 8.7;
  if (normalized.startsWith("B")) return 7.6;
  if (normalized.startsWith("C")) return 6.5;
  if (normalized.startsWith("D")) return 5.4;
  if (normalized.startsWith("E")) return 4.3;
  if (normalized.startsWith("F")) return 3.2;
  return 2;
}
