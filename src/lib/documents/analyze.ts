export type DocumentFindingDraft = {
  title: string;
  summary: string;
  severity: "low" | "medium" | "high";
  action: string;
};

export type DocumentAnalysisInput = {
  documentType: string;
  filename: string;
  text: string;
  bagAreaM2?: number | null;
  askingPrice?: number | null;
  offerAmount?: number | null;
  buildingYear?: number | null;
};

const RISK_PATTERNS: Array<{ re: RegExp; title: string; summary: string; severity: DocumentFindingDraft["severity"]; action: string }> = [
  { re: /lekkage|daklekkage|vochtplek|schimmel/i, title: "Vocht of lekkage genoemd", summary: "In de stukken staat vocht, schimmel of lekkage. Dat is een keuringspunt, geen reden om het te negeren.", severity: "high", action: "Vraag foto’s, herstelhistorie en laat de keurder hier gericht naar kijken." },
  { re: /funder|paalrot|palenpest|zetting/i, title: "Funderingsrisico in de tekst", summary: "Fundering of zetting wordt benoemd. Open data is geen funderingsonderzoek.", severity: "high", action: "Vraag om funderingsrapport of een specialistische inspectie." },
  { re: /asbest/i, title: "Asbest genoemd", summary: "Asbest in de stukken vraagt om een rapport of gerichte keuring, vooral bij bouw voor 1994.", severity: "medium", action: "Vraag of er een asbestinventarisatie is en of er een asbestclausule in de akte staat." },
  { re: /geschil|rechtszaak|procedure|handhaving/i, title: "Juridisch conflict genoemd", summary: "Er lijkt een geschil, procedure of handhaving in de stukken te staan.", severity: "high", action: "Laat de notaris of een jurist de passage duiden voordat je biedt." },
  { re: /bijzondere bijdrage|extra bijdrage|inhaal|achterstallig onderhoud/i, title: "Extra VvE-kosten of achterstallig onderhoud", summary: "De tekst wijst op extra bijdragen of onderhoud dat is blijven liggen.", severity: "high", action: "Vraag MJOP, reservefonds en of er een bijzondere bijdrage is vastgesteld." },
  { re: /ouderdomsclausule/i, title: "Ouderdomsclausule", summary: "Een ouderdomsclausule beperkt de aansprakelijkheid van de verkoper voor gebreken die bij de leeftijd passen.", severity: "medium", action: "Laat de notaris uitleggen wat je wél en niet kunt verhalen." },
  { re: /erfpacht|canon/i, title: "Erfpacht of canon", summary: "Erfpacht verandert de maandlast en de verkoopbaarheid. BAG zegt niet of de grond in erfpacht is.", severity: "medium", action: "Vraag resterende looptijd, canon en of afkoop mogelijk is." },
];

function parseLivingAreas(text: string) {
  const values: number[] = [];
  const prefixed = [...text.matchAll(/woonoppervlakte[^\d]{0,24}(\d{2,4}(?:[.,]\d)?)\s*m(?:2|²)/gi)];
  const suffixed = [...text.matchAll(/(\d{2,4}(?:[.,]\d)?)\s*m(?:2|²)[^\d]{0,16}woonoppervlakte/gi)];
  for (const match of [...prefixed, ...suffixed]) {
    const value = Number(match[1].replace(",", "."));
    if (Number.isFinite(value) && value >= 15 && value <= 800) values.push(value);
  }
  return [...new Set(values)];
}

function parsePrices(text: string) {
  const matches = [...text.matchAll(/(?:€\s*)(\d{1,3}(?:[.\s]\d{3})+|\d{5,7})/gi)];
  return matches.map((match) => Number(match[1].replace(/[.\s]/g, ""))).filter((value) => Number.isFinite(value) && value >= 10_000 && value <= 8_000_000);
}

export function analyzeDocumentText(input: DocumentAnalysisInput): DocumentFindingDraft[] {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (text.length < 40) {
    return [{ title: "Document nauwelijks leesbaar", summary: "We konden bijna geen tekst uit deze PDF halen. Scans zonder tekstlaag moeten handmatig.", severity: "medium", action: "Upload een doorzoekbare PDF of neem de kernpunten zelf over in je notities." }];
  }

  const findings: DocumentFindingDraft[] = [];
  const areas = parseLivingAreas(text);
  const prices = parsePrices(text);

  if (input.bagAreaM2 && areas.length) {
    const advertised = areas.find((value) => Math.abs(value - input.bagAreaM2!) / input.bagAreaM2! > 0.08);
    if (advertised) {
      findings.push({
        title: "Oppervlakte wijkt af van BAG",
        summary: `In het document staat ongeveer ${advertised} m², BAG registreert ${input.bagAreaM2} m². Dat is geen meetfout die we stil mogen wegstrepen.`,
        severity: "medium",
        action: "Vraag welke meetinstructie de advertentie gebruikt (NEN 2580) en of berging/zolder is meegerekend.",
      });
    }
  }

  if (input.documentType === "koopcontract" && input.offerAmount && prices.length) {
    const contractPrice = prices.find((value) => Math.abs(value - input.offerAmount!) >= 500);
    const matching = prices.find((value) => Math.abs(value - input.offerAmount!) < 500);
    if (contractPrice && !matching) {
      findings.push({
        title: "Koopsom wijkt af van je bod",
        summary: `In de akte staat een bedrag rond € ${contractPrice.toLocaleString("nl-NL")}, je conceptbod is € ${input.offerAmount.toLocaleString("nl-NL")}.`,
        severity: "high",
        action: "Zet de akte naast je bieding en vraag de notaris of makelaar om de afwijking.",
      });
    }
  }

  if (input.documentType === "vve") {
    if (!/mjop|meerjaren/i.test(text)) {
      findings.push({ title: "MJOP niet duidelijk genoemd", summary: "In deze VvE-stukken is geen duidelijk meerjarenonderhoudsplan herkend.", severity: "medium", action: "Vraag het actuele MJOP en de laatste Algemene Ledenvergadering-notulen." });
    }
    if (!/reservefonds|reserve fonds/i.test(text)) {
      findings.push({ title: "Reservefonds onduidelijk", summary: "Het reservefonds is niet herkend. Dat zegt nog niet dat het ontbreekt, wel dat je het moet nazoeken.", severity: "medium", action: "Vraag de stand van het reservefonds en of er een bijzondere bijdrage aankomt." });
    }
  }

  if (input.documentType === "vragenlijst" || /vragenlijst/i.test(input.filename)) {
    if (!/lekkage|vocht|dak|cv|fundering/i.test(text)) {
      findings.push({ title: "Vragenlijst lijkt incompleet", summary: "Kenmerkende onderhoudsvragen (dak, vocht, CV, fundering) zijn niet herkend.", severity: "low", action: "Loop de vragenlijst zelf na en markeer lege of ontwijkende antwoorden." });
    }
  }

  if (input.buildingYear && input.buildingYear < 1945 && !/funder/i.test(text) && (input.documentType === "brochure" || input.documentType === "vragenlijst")) {
    findings.push({
      title: "Fundering niet toegelicht bij vooroorlogse bouw",
      summary: `BAG-bouwjaar ${input.buildingYear} en de stukken noemen fundering niet. Dat is een gat, geen groene vlag.`,
      severity: "medium",
      action: "Vraag de verkoper naar funderingsonderzoek of bekende zetting.",
    });
  }

  for (const pattern of RISK_PATTERNS) {
    if (pattern.re.test(text)) {
      findings.push({ title: pattern.title, summary: pattern.summary, severity: pattern.severity, action: pattern.action });
    }
  }

  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.title)) return false;
    seen.add(finding.title);
    return true;
  }).slice(0, 8);
}
