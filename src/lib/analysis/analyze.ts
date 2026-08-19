import type { Analysis, EverydayInsight, Evidence, Property, Signal } from "@/src/lib/types";
import { getBgtContext, pdokUrls, type BgtContext } from "@/src/lib/sources/pdok/bgt";
import { getEnergyLabel, epOnlineUrl } from "@/src/lib/sources/ep-online";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { distanceToGeometryM, geometryAreaM2 } from "@/src/lib/geo/measure";
import { calculateOverallScore, componentFromSignal, SCORING_VERSION, scoreSeverity } from "@/src/lib/scoring/score";
import { getNearbyProperties } from "@/src/lib/sources/pdok/bag";
import { getRivmContext, rivmUrls, type RivmContext } from "@/src/lib/sources/rivm";
import { getCbsContext, cbsBuurtenUrl, schoolScoreFromCbs, type CbsContext } from "@/src/lib/sources/cbs";
import { getNdovContext, ndovHaltesUrl, type NdovContext } from "@/src/lib/sources/ndov";
import { getDsoContext, dsoOnderwerpenUrl, type DsoContext } from "@/src/lib/sources/dso";
import { getSesContext, sesStatLineTableUrl, type SesContext } from "@/src/lib/sources/ses";
import { crimeScoreFromRatePer1000, getCrimeContext, politieMisdrijvenTableUrl, type CrimeContext } from "@/src/lib/sources/politie";
import { getBodemContext, type BodemContext } from "@/src/lib/sources/bodem";

const ANALYSIS_VERSION = "2026.08.v1";

function clamp(value: number, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

function formatDistance(distance: number) {
  if (!Number.isFinite(distance)) return "meer dan 250 m";
  return distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
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
  const [rivmResult, cbsResult, ndovResult, dsoResult, bodemResult] = await Promise.allSettled([
    getRivmContext(property.coordinates),
    getCbsContext(property.coordinates),
    getNdovContext(property.coordinates),
    getDsoContext(property.coordinates),
    getBodemContext(property.coordinates, property.province),
  ]);
  const rivm: RivmContext | null = rivmResult.status === "fulfilled" ? rivmResult.value : null;
  const cbs: CbsContext | null = cbsResult.status === "fulfilled" ? cbsResult.value : null;
  const ndov: NdovContext | null = ndovResult.status === "fulfilled" ? ndovResult.value : null;
  const dso: DsoContext | null = dsoResult.status === "fulfilled" ? dsoResult.value : null;
  const bodem: BodemContext | null = bodemResult.status === "fulfilled" ? bodemResult.value : null;
  if (rivmResult.status === "rejected") console.warn("RIVM unavailable", rivmResult.reason);
  if (cbsResult.status === "rejected") console.warn("CBS buurtcontext unavailable", cbsResult.reason);
  if (ndovResult.status === "rejected") console.warn("NDOV haltes unavailable", ndovResult.reason);
  if (dsoResult.status === "rejected") console.warn("DSO onderwerpen unavailable", dsoResult.reason);
  if (bodemResult.status === "rejected") console.warn("Bodemregister WFS unavailable", bodemResult.reason);
  const [sesResult, crimeResult] = await Promise.allSettled([
    cbs ? getSesContext(cbs) : Promise.resolve(null),
    cbs ? getCrimeContext(cbs) : Promise.resolve(null),
  ]);
  const ses: SesContext | null = sesResult.status === "fulfilled" ? sesResult.value : null;
  const crime: CrimeContext | null = crimeResult.status === "fulfilled" ? crimeResult.value : null;
  if (sesResult.status === "rejected") console.warn("CBS SES-WOA unavailable", sesResult.reason);
  if (crimeResult.status === "rejected") console.warn("Politie misdrijven unavailable", crimeResult.reason);
  const origin = property.coordinates;
  const greenAreaM2 = bgt.greenAreas.reduce((sum, feature) => sum + geometryAreaM2(feature.geometry, origin), 0);
  // getBgtFeatures queries a square bbox of ±250 m (500 m side), not a 250 m
  // radius circle. Using a circular denominator here overstated green% by
  // roughly (500² − π·250²) / 500² ≈ 21%.
  const BGT_SEARCH_RADIUS_M = 250;
  const searchAreaM2 = (BGT_SEARCH_RADIUS_M * 2) ** 2;
  const greenPercent = clamp((greenAreaM2 / searchAreaM2) * 100, 0, 100);
  const nearestRoadM = bgt.roads.length
    ? Math.min(...bgt.roads.map((feature) => distanceToGeometryM(origin, feature.geometry)))
    : Number.POSITIVE_INFINITY;
  const nearestWaterM = bgt.water.length
    ? Math.min(...bgt.water.map((feature) => distanceToGeometryM(origin, feature.geometry)))
    : Number.POSITIVE_INFINITY;
  const waterAreaM2 = bgt.water.reduce((sum, feature) => sum + geometryAreaM2(feature.geometry, origin), 0);
  const waterPercent = clamp((waterAreaM2 / searchAreaM2) * 100, 0, 100);
  // The BGT collection endpoints cap results at limit=100. Dense city
  // centres can genuinely have >100 road or green-terrain parts within the
  // search box, in which case the percentage below silently underrepresents
  // the true count instead of reflecting a complete picture.
  const BGT_PAGE_CAP = 100;
  const bgtGreenTruncated = bgt.greenAreas.length >= BGT_PAGE_CAP;
  const bgtRoadsTruncated = bgt.roads.length >= BGT_PAGE_CAP;

  const nonResidential = property.isResidential === false;
  const siblingResidentialUnits = nearbyProperties.filter(
    (item) => item.pandIds?.some((id) => property.bagPandIds.includes(id)),
  );
  const likelyApartmentOrVve = siblingResidentialUnits.length >= 1;

  const identity = identityEvidence(property);
  const bgtRoadEvidence = createEvidence({
    id: "bgt-roads",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/wegdeel/items`,
    confidence: "medium",
    fetchedAt: bgt.fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: "De BGT-proxy zegt iets over lokale wegstructuur, niet over een officiële gevelmeting of verkeersmodel.",
  });
  const bgtGreenEvidence = createEvidence({
    id: "bgt-green",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/begroeidterreindeel/items`,
    confidence: "medium",
    fetchedAt: bgt.fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: "Groenpercentage is een eerste geometrische indicatie binnen circa 250 meter.",
  });
  const bgtWaterEvidence = createEvidence({
    id: "bgt-water",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/waterdeel/items`,
    confidence: "medium",
    fetchedAt: bgt.fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: "Dit is alleen de aanwezigheid van geregistreerd oppervlaktewater, geen overstromings- of wateroverlastmodel.",
  });
  const energyEvidence = createEvidence({
    id: "ep-online-energy",
    source: "EP-Online / RVO",
    sourceUrl: epOnlineUrl,
    sourceRecordId: property.bagVboId,
    sourceUpdatedAt: energy?.Registratiedatum ?? energy?.Opnamedatum,
    confidence: "high",
    spatialResolution: "BAG-verblijfsobject",
    caveat: "Een energielabel zegt niets over de actuele staat of het werkelijke verbruik van de woning.",
  });
  const rivmAvailable = Boolean(rivm && (rivm.noiseLden != null || rivm.no2 != null || rivm.pm25 != null));
  const rivmMetricCount = [rivm?.noiseLden, rivm?.no2, rivm?.pm25].filter((value) => value != null).length;
  const cbsAvailable = Boolean(cbs);
  const ndovAvailable = Boolean(ndov);
  const dsoAvailable = Boolean(dso);
  const sesAvailable = Boolean(ses);
  const crimeAvailable = Boolean(crime);
  const rivmEvidence = createEvidence({
    id: "rivm-air-noise",
    source: "RIVM geo-services",
    sourceUrl: rivmUrls.noise,
    confidence: "medium",
    fetchedAt: rivm?.fetchedAt,
    spatialResolution: "RIVM rastercel",
    caveat: "RIVM-waarden zijn model- of rasterwaarden; gevel, verdieping en momentane omstandigheden kunnen afwijken.",
  });
  const cbsEvidence = createEvidence({
    id: "cbs-buurtcontext",
    source: "CBS Wijk- en Buurtkaart",
    sourceUrl: cbsBuurtenUrl,
    confidence: "medium",
    fetchedAt: cbs?.fetchedAt,
    spatialResolution: "buurt",
    caveat: "Buurtgemiddelden zijn context en beschrijven niet één woning of huishouden.",
  });
  const sesEvidence = createEvidence({
    id: "cbs-ses-woa",
    source: "CBS SES-WOA",
    sourceUrl: sesStatLineTableUrl,
    sourceRecordId: ses?.regionCode,
    sourceUpdatedAt: ses?.periodYear,
    confidence: "medium",
    fetchedAt: ses?.fetchedAt,
    spatialResolution: ses?.spatialScale ?? "buurt",
    caveat: "SES-WOA is een buurtgemiddelde van welvaart, opleidingsniveau en arbeidsverleden; het beschrijft geen huishouden of woning.",
  });
  const crimeEvidence = createEvidence({
    id: "politie-misdrijven",
    source: "Politie / CBS",
    sourceUrl: politieMisdrijvenTableUrl,
    sourceRecordId: crime?.regionCode,
    sourceUpdatedAt: crime?.periodYear,
    confidence: "medium",
    fetchedAt: crime?.fetchedAt,
    spatialResolution: crime?.spatialScale ?? "buurt",
    caveat: "Alleen bij de politie geregistreerde misdrijven, inclusief pogingen. Niet iedereen doet aangifte; dit is geen slachtofferenquête.",
  });
  const ndovEvidence = createEvidence({
    id: "ndov-haltes",
    source: "NDOV haltes",
    sourceUrl: ndovHaltesUrl,
    confidence: "high",
    sourceRecordId: ndov?.catalogDate,
    fetchedAt: ndov?.fetchedAt,
    spatialResolution: "haltecoördinaat",
    caveat: "Een nabijgelegen halte zegt niets over frequentie, reistijd of toegankelijkheid van de specifieke lijn.",
  });
  const dsoEvidence = createEvidence({
    id: "dso-onderwerpen",
    source: "DSO Omgevingsdocumenten",
    sourceUrl: dsoOnderwerpenUrl,
    confidence: "medium",
    fetchedAt: dso?.fetchedAt,
    spatialResolution: "puntbevraging",
    caveat: "De DSO-bevraging signaleert relevante onderwerpen; controleer de actuele regeling en kaartlagen voor juridische conclusies.",
  });

  const bodemEvidence = bodem && bodem.totalMatches > 0 ? createEvidence({
    id: "bodemregister-wfs",
    source: "Lokale bodemregisters (WFS)",
    sourceUrl: bodem.providers.map((p) => p.sourceUrl).join(", "),
    sourceRecordId: bodem.providers
      .map((p) => `${p.provider}: ${p.layers.map((l) => l.layerKey).join(", ")}`)
      .join(" | "),
    confidence: "medium",
    fetchedAt: bodem.fetchedAt,
    spatialResolution: "circa 200 m bbox rond dit adres",
    caveat: bodem.caveat,
  }) : null;

  const noiseScore = rivm?.noiseLden != null
    ? clamp(10 - Math.max(0, rivm.noiseLden - 35) / 4)
    : clamp(nearestRoadM === Infinity ? 8 : 8 - Math.max(0, 120 - nearestRoadM) / 25);
  const greenScore = clamp(4 + greenPercent / 8);
  const heatScore = clamp(9 - (100 - greenPercent) / 18);
  const olderBuilding = property.buildingYear != null && property.buildingYear < 1945;

  const bodemLayerLabel: Record<string, string> = {
    verontreinigd: "verontreinigingen",
    verdacht: "verdachte locaties",
    olietanks: "olietanks / tanklocaties",
    hbb: "Historisch Bodem Bestand (HBB)",
    stortplaatsen_vv: "voormalige stortplaatsen",
    spoedlocaties: "spoedlocaties",
  };
  const bodemHitsByLayer =
    bodem?.providers.flatMap((p) =>
      p.layers
        .filter((l) => l.matchedCount > 0)
        .map((l) => `${p.provider}: ${bodemLayerLabel[l.layerKey] ?? l.layerKey} (${l.matchedCount})`),
    ) ?? [];

  let soilSignal: Signal | null = null;
  if (bodem && bodem.totalMatches > 0 && bodemEvidence) {
    soilSignal = {
      key: "soil-contamination",
      label: "Bodemverontreiniging (indicatie)",
      category: "klimaat",
      value: bodem.totalMatches > 99 ? "99+ locaties" : `${bodem.totalMatches} locatie(s)`,
      severity: "attention",
      summary: `In beschikbare regionale bodemregister-lagen zijn indicaties gevonden bij dit adres: ${bodemHitsByLayer.slice(0, 3).join("; ")}.${
        bodemHitsByLayer.length > 3 ? " (meer hits mogelijk)" : ""
      } Dit is screening op basis van WFS-bbox-hits; voor zekerheid check je het provinciaal/gemeentelijk bodemloket via Bodemloket.`,
      action: "Check Bodemloket.nl en vraag bij de bevoegde omgevingsdienst naar de relevante bodemrapportage/dossierstatus.",
      confidence: "medium",
      spatialScale: "circa 200 m bbox rond dit adres",
      raw: {
        value: bodem.totalMatches,
        unit: "locaties",
        metric: "Aantal WFS-bbox matches (screening)",
      },
      evidence: [bodemEvidence],
      availability: "available",
    };
  }

  const signals: Signal[] = [
    {
      key: "noise",
      label: "Geluidsscreening",
      category: "gezondheid",
      value: Math.round(noiseScore * 10) / 10,
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
      summary: `Ongeveer ${Math.round(greenPercent)}% van de lokale BGT-oppervlakken is als begroeid terrein geregistreerd.${bgtGreenTruncated ? " Let op: de BGT-bevraging is afgekapt op 100 vlakken; in dicht bebouwd gebied kan het werkelijke groenpercentage hierdoor afwijken." : ""}`,
      action: "Check bij een bezichtiging ook de boomkroon, privacy en het groen dat je daadwerkelijk vanuit de woning ziet.",
      raw: { value: Math.round(greenPercent), unit: "%", metric: "BGT-begroeid terrein binnen circa 250 m" },
      confidence: bgtGreenTruncated ? "low" : "medium",
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
      summary: `De eerste groen/verharding-proxy komt uit op ${Math.round(greenPercent)}% groen in de zoekbuffer.${bgtGreenTruncated ? " De BGT-bevraging is afgekapt op 100 vlakken, dus deze proxy is minder betrouwbaar in dicht bebouwd gebied." : ""}`,
      action: "Kijk op een hete dag naar schaduw, geveloriëntatie en de hoeveelheid verharding rond tuin en straat.",
      raw: { value: Math.round(100 - greenPercent), unit: "% verhardingsproxy", metric: "afgeleid uit BGT" },
      confidence: "low",
      spatialScale: "circa 250 m zoekbuffer",
      evidence: [bgtGreenEvidence],
      availability: bgtAvailable ? "available" : "unavailable",
    },
    {
      key: "water",
      label: "Oppervlaktewater",
      category: "klimaat",
      value: Number.isFinite(nearestWaterM) ? formatDistance(nearestWaterM) : "Geen water gevonden",
      severity: nearestWaterM < 30 ? "attention" : Number.isFinite(nearestWaterM) ? "good" : "neutral",
      summary: nearestWaterM < 30
        ? `BGT registreert oppervlaktewater op circa ${formatDistance(nearestWaterM)}. Zo dicht op open water is het grondwaterpeil vaak hoger, wat kruipruimte- en funderingsvocht kan beïnvloeden.`
        : Number.isFinite(nearestWaterM)
          ? `BGT registreert oppervlaktewater op circa ${formatDistance(nearestWaterM)} (${Math.round(waterPercent)}% van de zoekbuffer).`
          : "BGT registreert geen oppervlaktewater binnen de zoekbuffer van circa 250 m.",
      action: nearestWaterM < 30
        ? "Vraag naar het grondwaterpeil, de kruipruimte en vochtwering; laat dit meenemen in de bouwkundige keuring."
        : "Dit zegt niets over overstromings- of wateroverlastrisico. Check risicokaart.nl (Overstroming) voor een officiële inschatting.",
      confidence: "low",
      spatialScale: "circa 250 m zoekbuffer",
      evidence: [bgtWaterEvidence],
      availability: bgtAvailable ? "available" : "unavailable",
    },
    ...(soilSignal ? [soilSignal] : []),
    {
      key: "access",
      label: "Lokale wegstructuur",
      category: "mobiliteit",
      value: `${bgt.roads.length} wegdelen`,
      severity: "neutral",
      summary: `${bgt.roads.length} BGT-wegdelen zijn in de eerste zoekbuffer aangetroffen; dit beschrijft de straatstructuur, geen bereikbaarheid.${bgtRoadsTruncated ? " De telling is afgekapt op 100 wegdelen; het werkelijke aantal kan hoger liggen." : ""}`,
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
      key: "usage",
      label: "Gebruiksdoel",
      category: "woning",
      value: nonResidential ? (property.usagePurposes?.join(", ") || "Geen woonfunctie") : "Woonfunctie",
      severity: nonResidential ? "attention" : "neutral",
      summary: nonResidential
        ? `BAG registreert dit object niet als woonfunctie (${property.usagePurposes?.join(", ") || "onbekend gebruiksdoel"}). Deze woningcheck is gebouwd voor woningen; de scores hierboven zijn mogelijk niet zinvol voor dit gebruik.`
        : "BAG registreert dit object als woonfunctie.",
      action: nonResidential
        ? "Controleer of dit pand daadwerkelijk te koop staat als woning en of woonbestemming/vergunning aanwezig is voordat je verdergaat."
        : "Geen actie nodig; controleer bij twijfel de vergunde bestemming bij de gemeente.",
      confidence: "high",
      spatialScale: "BAG-verblijfsobject",
      evidence: [identityEvidence(property)],
      availability: "available",
    },
    {
      key: "vve",
      label: "Appartement & VvE",
      category: "woning",
      value: likelyApartmentOrVve ? `${siblingResidentialUnits.length} andere woonadres(sen) in hetzelfde pand` : "Vermoedelijk zelfstandig pand",
      severity: likelyApartmentOrVve ? "attention" : "neutral",
      summary: likelyApartmentOrVve
        ? `BAG registreert ${siblingResidentialUnits.length} andere woonfunctie-verblijfsobject(en) in hetzelfde pand. Dit wijst op een appartement(encomplex); controleer VvE-status, reservefonds, splitsingsakte en erfpacht.`
        : "BAG registreert geen andere woonfunctie-verblijfsobjecten in hetzelfde pand; een VvE is dan minder waarschijnlijk, maar niet uitgesloten.",
      action: likelyApartmentOrVve
        ? "Vraag de VvE-jaarstukken, notulen, meerjarenonderhoudsplan (MJOP) en reservefonds op vóór je een bod doet."
        : "Vraag bij twijfel na of het pand is gesplitst in appartementsrechten.",
      confidence: "low",
      spatialScale: "BAG-pand",
      evidence: [identityEvidence(property)],
      availability: nearbyAvailable ? "available" : "unavailable",
    },
    {
      key: "foundation",
      label: "Fundering & constructie",
      category: "woning",
      value: olderBuilding ? "Onderzoeken" : "Niet beoordeeld",
      severity: olderBuilding ? "attention" : "neutral",
      summary: olderBuilding
        ? `Dit pand heeft een BAG-bouwjaar van ${property.buildingYear}. BAG zegt niets over fundering, verzakking of eerder herstel; onderzoek dit vóór je bod.`
        : "Openbare adresdata bevat geen informatie over fundering, constructieve staat of eerder herstel.",
      action: olderBuilding
        ? "Vraag naar funderingsonderzoek, herstel, scheurvorming, peilmetingen en verzekerbaarheid; laat dit beoordelen in een bouwkundige keuring."
        : "Vraag naar constructieve gebreken, eerdere herstelwerkzaamheden en keuringsrapporten.",
      confidence: "low",
      spatialScale: "BAG-pand (geen funderingsregistratie)",
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
      label: "Buurtvoorzieningen",
      category: "buurt",
      value: cbs?.buurtName ?? "Geen data",
      score: cbs?.supermarketDistanceKm != null ? clamp(9 - cbs.supermarketDistanceKm * 1.5) : cbs ? 6 : undefined,
      severity: cbs ? scoreSeverity(cbs.supermarketDistanceKm != null ? clamp(9 - cbs.supermarketDistanceKm * 1.5) : 6) : "neutral",
      summary: cbs?.buurtName
        ? `${cbs.buurtName}${cbs.municipalityName ? ` (${cbs.municipalityName})` : ""}: gemiddelde afstand tot een grote supermarkt is ${cbs.supermarketDistanceKm != null ? formatKm(cbs.supermarketDistanceKm) : "onbekend"}${cbs.huisartsDistanceKm != null ? `, huisarts ${formatKm(cbs.huisartsDistanceKm)}` : ""}. Dit is geen woningwaardering.`
        : "Er is geen CBS-buurtcontext beschikbaar.",
      action: "Vergelijk buurtgemiddelden met je eigen leefstijl en controleer voorzieningen op verschillende tijdstippen.",
      raw: cbs?.supermarketDistanceKm != null ? { value: cbs.supermarketDistanceKm, unit: "km", metric: "CBS gemiddelde afstand supermarkt" } : undefined,
      confidence: "medium",
      spatialScale: "buurt",
      evidence: [cbsEvidence],
      availability: cbsAvailable ? "available" : "unavailable",
    },
    ...neighborhoodSignals({ cbs, ses, crime, cbsEvidence, sesEvidence, crimeEvidence }),
    {
      key: "transit",
      label: "OV-haltes",
      category: "mobiliteit",
      value: ndov?.nearestDistanceM != null ? `${Math.round(ndov.nearestDistanceM / 10) * 10} m` : ndov ? "Geen halte < 1 km" : "Geen data",
      score: ndov?.nearestDistanceM != null ? clamp(10 - ndov.nearestDistanceM / 150) : ndov ? 3 : undefined,
      severity: ndov ? scoreSeverity(ndov.nearestDistanceM != null ? clamp(10 - ndov.nearestDistanceM / 150) : 3) : "neutral",
      summary: ndov?.nearestDistanceM != null ? `Dichtstbijzijnde NDOV-halte ligt op circa ${formatDistance(ndov.nearestDistanceM)}; ${ndov.stopCount} halte(n) binnen 1 km${ndov.catalogDate ? ` (catalogus ${ndov.catalogDate})` : ""}.` : ndov ? "Geen NDOV-halte binnen 1 kilometer gevonden; controleer de catalogus en lokale dienstregeling voordat je hierop beslist." : "De NDOV-haltecatalogus kon niet worden opgehaald.",
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
    ...(sesAvailable ? [sesEvidence] : []),
    ...(crimeAvailable ? [crimeEvidence] : []),
    ...(ndovAvailable ? [ndovEvidence] : []),
    ...(dsoAvailable ? [dsoEvidence] : []),
    ...(soilSignal ? [bodemEvidence!] : []),
  ];
  const categoryLabels = {
    woning: "Woning",
    gezondheid: "Gezondheid & hinder",
    klimaat: "Klimaat & bodem",
    mobiliteit: "Mobiliteit",
    buurt: "Buurt & voorzieningen",
    toekomst: "Toekomst",
  } as const;
  const domains = Object.entries(categoryLabels).map(([key, label]) => {
    const domainSignals = signals.filter((signal) => signal.category === key);
    const availableSignals = domainSignals.filter((signal) => signal.availability !== "unavailable" && typeof signal.score === "number");
    // A signal such as "fundering" can carry severity "attention" without a
    // numeric score (BAG has no funderingsregistratie). Averaging only the
    // scored signals then silently drops the warning from the domain score,
    // e.g. showing "Woning 9.1/10" while an unresolved foundation flag is
    // open. Cap the score instead of letting it look clean.
    const hasUnscoredAttention = domainSignals.some((signal) => signal.availability !== "unavailable" && typeof signal.score !== "number" && signal.severity === "attention");
    let score = availableSignals.length
      ? Math.round((availableSignals.reduce((sum, signal) => sum + (signal.score ?? 0), 0) / availableSignals.length) * 10) / 10
      : null;
    if (score != null && hasUnscoredAttention) score = Math.min(score, 6.4);
    return {
      key: key as keyof typeof categoryLabels,
      label,
      score,
      signalKeys: domainSignals.map((signal) => signal.key),
      available: availableSignals.length > 0,
      hasUnscoredAttention,
      summary: score == null
        ? "Voor dit domein is nu geen betrouwbare bron beschikbaar."
        : hasUnscoredAttention
          ? `Gemiddelde indicatie ${score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10 — met een open aandachtspunt zonder score (zie hieronder); laat het cijfer dit niet verbloemen.`
          : `Gemiddelde indicatie ${score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10.`,
    };
  });
  const availableSignals = signals.filter((signal) => signal.availability !== "unavailable");
  // Signals without a numeric score (e.g. "context", "access") must never
  // fall into the attention/positive buckets: defaulting them to a score of
  // 5 previously made plain facts ("107 m² woonoppervlak") show up as
  // "aandachtspunten", crowding out genuine risks like an attention-flagged
  // foundation signal that itself has no numeric score either.
  const scoredSignals = availableSignals.filter((signal): signal is Signal & { score: number } => typeof signal.score === "number");
  const flaggedUnscored = availableSignals.filter((signal) => typeof signal.score !== "number" && signal.severity === "attention");
  const highlights = [
    ...flaggedUnscored.map((signal) => ({ type: "attention" as const, signalKey: signal.key, text: signal.summary })),
    ...scoredSignals
      .filter((signal) => signal.score < 5.5)
      .sort((a, b) => a.score - b.score)
      .map((signal) => ({ type: "attention" as const, signalKey: signal.key, text: signal.summary })),
  ].slice(0, 3);
  const positives = scoredSignals
    .filter((signal) => signal.score >= 6.5)
    .sort((a, b) => b.score - a.score)
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
  const schoolSignal = signal("schools");
  const childrenSignal = signal("children");
  if (schoolSignal || childrenSignal) {
    const schoolScoreValue = scoreOf("schools");
    const tone = schoolScoreValue != null && schoolScoreValue < 5.5 ? "attention" : schoolScoreValue != null && schoolScoreValue >= 6.5 ? "good" : "neutral";
    insights.push({
      title: "Gezin en school",
      summary: tone === "good"
        ? "Basisschool en opvang liggen volgens CBS-buurtgemiddelden dichtbij. Loop de route op een schooldag na; de cijfers zijn buurtgemiddelden, geen loopafstand vanaf de voordeur."
        : tone === "attention"
          ? "Scholen of opvang liggen volgens de buurtstatistiek verder weg. Check de echte fiets- of looproute en of er plek is op de school van je voorkeur."
          : "De buurtcijfers over kinderen en scholen geven geen uitgesproken beeld. Gebruik ze als startpunt en check zelf de scholen in de wijk.",
      tone,
      signalKeys: ["schools", "children"].filter((key) => Boolean(signal(key))),
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
      ...(sesAvailable ? ["CBS SES-WOA"] : []),
      ...(crimeAvailable ? ["Politie / CBS misdrijven"] : []),
      ...(ndovAvailable ? ["NDOV haltes"] : []),
      ...(dsoAvailable ? ["DSO Omgevingsdocumenten"] : []),
      ...(bodem ? ["Lokale bodemregisters (WFS)"] : []),
    ],
    domains,
    everydayInsights: insights,
    highlights: [...highlights, ...positives],
    dataCoverage: { available: availableDomainCount, total: domains.length, label: `${availableDomainCount} van ${domains.length} onderwerpen beschikbaar` },
    sourceStatuses: [
      { source: "PDOK / BAG", status: "ok", sourceUrl: pdokUrls.bag },
      { source: "PDOK / BGT", status: bgtAvailable ? "ok" : "unavailable", message: bgtAvailable ? undefined : "Lokale topografie kon niet worden opgehaald.", sourceUrl: pdokUrls.bgt },
      { source: "PDOK / BAG omgeving", status: nearbyAvailable ? "ok" : "unavailable", message: nearbyAvailable ? undefined : "Nabije adressen konden niet worden opgehaald.", sourceUrl: pdokUrls.bag },
      { source: "EP-Online / RVO", status: energyAvailable ? "ok" : "unavailable", message: energyAvailable ? undefined : "Energielabels zijn nu niet beschikbaar voor dit adres.", sourceUrl: epOnlineUrl },
      { source: "RIVM geo-services", status: rivmMetricCount === 3 ? "ok" : rivmMetricCount > 0 ? "partial" : "unavailable", message: rivmAvailable ? undefined : "RIVM-rasterwaarden konden niet worden opgehaald.", sourceUrl: rivmUrls.noise },
      { source: "CBS Wijk- en Buurtkaart", status: cbsAvailable ? "ok" : "unavailable", message: cbsAvailable ? undefined : "Geen CBS-buurtfeature gevonden of bron niet bereikbaar.", sourceUrl: cbsBuurtenUrl },
      { source: "CBS SES-WOA", status: sesAvailable ? "ok" : "unavailable", message: sesAvailable ? undefined : "Geen SES-WOA-score beschikbaar voor deze buurt.", sourceUrl: sesStatLineTableUrl },
      { source: "Politie / CBS misdrijven", status: crimeAvailable ? "ok" : "unavailable", message: crimeAvailable ? undefined : "Geen geregistreerde misdrijvencijfers beschikbaar voor deze buurt.", sourceUrl: politieMisdrijvenTableUrl },
      { source: "NDOV haltes", status: ndovAvailable ? "ok" : "unavailable", message: ndovAvailable ? undefined : "De openbare haltecatalogus kon niet worden opgehaald.", sourceUrl: ndovHaltesUrl },
      { source: "DSO Omgevingsdocumenten", status: dsoAvailable ? "ok" : "unavailable", message: dsoAvailable ? undefined : "Ruimtelijke onderwerpen zijn nu niet beschikbaar voor dit adres.", sourceUrl: dsoOnderwerpenUrl },
      {
        source: "Lokale bodemregisters (WFS)",
        status: bodemResult.status === "rejected" ? "unavailable" : bodem ? (bodem.overallStatus === "ok" ? "ok" : "partial") : "unavailable",
        message:
          bodemResult.status === "rejected"
            ? "Bodemregister WFS kon niet worden opgehaald."
            : bodem
              ? bodem.totalMatches === 0
                ? "Geen bodemregister-hits gevonden in de beschikbare regionale WFS-datasets voor dit adres."
                : undefined
              : "Bodemregister WFS is nog niet (volledig) geconfigureerd voor deze provincie.",
        sourceUrl: bodem ? bodem.providers.map((p) => p.sourceUrl).join(", ") : undefined,
      },
    ],
    knownGaps: [
      {
        key: "flood-risk",
        label: "Overstromings- en wateroverlastrisico",
        summary: "WoonReality modelleert geen overstromingskans of wateroverlast bij hevige regen. Het 'Oppervlaktewater'-signaal hierboven laat alleen zien of er BGT-water vlakbij ligt, geen risicoberekening.",
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
    ],
    nearbyProperties,
  };
}

function neighborhoodSignals(input: {
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
