import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { formatLocaleTag } from "@/src/lib/format-locale";

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

const RISK_PATTERNS: Array<{ re: RegExp; copyKey: string; severity: DocumentFindingDraft["severity"] }> = [
  { re: /lekkage|daklekkage|vochtplek|schimmel/i, copyKey: "moisture", severity: "high" },
  { re: /funder|paalrot|palenpest|zetting/i, copyKey: "foundation", severity: "high" },
  { re: /asbest/i, copyKey: "asbestos", severity: "medium" },
  { re: /geschil|rechtszaak|procedure|handhaving/i, copyKey: "legalConflict", severity: "high" },
  { re: /bijzondere bijdrage|extra bijdrage|inhaal|achterstallig onderhoud/i, copyKey: "vveExtraCosts", severity: "high" },
  { re: /ouderdomsclausule/i, copyKey: "ageClause", severity: "medium" },
  { re: /erfpacht|canon/i, copyKey: "leasehold", severity: "medium" },
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

export function analyzeDocumentText(input: DocumentAnalysisInput, locale: Locale = "nl"): DocumentFindingDraft[] {
  const t = getLibTranslator(locale, "lib-finance");
  const numTag = formatLocaleTag(locale);
  const finding = (subKey: string, severity: DocumentFindingDraft["severity"], params?: Record<string, unknown>): DocumentFindingDraft => ({
    title: t(`documents.${subKey}.title`),
    summary: t(`documents.${subKey}.summary`, params),
    severity,
    action: t(`documents.${subKey}.action`),
  });
  const text = input.text.replace(/\s+/g, " ").trim();
  if (text.length < 40) {
    return [finding("unreadable", "medium")];
  }

  const findings: DocumentFindingDraft[] = [];
  const areas = parseLivingAreas(text);
  const prices = parsePrices(text);

  if (input.bagAreaM2 && areas.length) {
    const advertised = areas.find((value) => Math.abs(value - input.bagAreaM2!) / input.bagAreaM2! > 0.08);
    if (advertised) {
      findings.push(finding("areaMismatch", "medium", { advertised: advertised.toLocaleString(numTag), registered: input.bagAreaM2!.toLocaleString(numTag) }));
    }
  }

  if (input.documentType === "koopcontract" && input.offerAmount && prices.length) {
    const contractPrice = prices.find((value) => Math.abs(value - input.offerAmount!) >= 500);
    const matching = prices.find((value) => Math.abs(value - input.offerAmount!) < 500);
    if (contractPrice && !matching) {
      findings.push(finding("priceMismatch", "high", { contract: contractPrice.toLocaleString(numTag), offer: input.offerAmount.toLocaleString(numTag) }));
    }
  }

  if (input.documentType === "vve") {
    if (!/mjop|meerjaren/i.test(text)) {
      findings.push(finding("mjopMissing", "medium"));
    }
    if (!/reservefonds|reserve fonds/i.test(text)) {
      findings.push(finding("reserveFundUnclear", "medium"));
    }
  }

  if (input.documentType === "vragenlijst" || /vragenlijst/i.test(input.filename)) {
    if (!/lekkage|vocht|dak|cv|fundering/i.test(text)) {
      findings.push(finding("questionnaireIncomplete", "low"));
    }
  }

  if (input.buildingYear && input.buildingYear < 1945 && !/funder/i.test(text) && (input.documentType === "brochure" || input.documentType === "vragenlijst")) {
    findings.push(finding("prewarFoundation", "medium", { year: input.buildingYear }));
  }

  for (const pattern of RISK_PATTERNS) {
    if (pattern.re.test(text)) {
      findings.push(finding(`patterns.${pattern.copyKey}`, pattern.severity));
    }
  }

  const seen = new Set<string>();
  return findings.filter((finding) => {
    if (seen.has(finding.title)) return false;
    seen.add(finding.title);
    return true;
  }).slice(0, 8);
}
