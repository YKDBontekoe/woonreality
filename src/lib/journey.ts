import { PROPERTY_STAGE_LABELS, type PropertyStage } from "@/src/lib/purchase";

export const CASE_STAGES = [
  "intake",
  "research",
  "viewing",
  "offer",
  "negotiation",
  "contract",
  "finance_inspection",
  "transfer",
] as const;

export type CaseStage = (typeof CASE_STAGES)[number];

export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  intake: "Woonprofiel",
  research: "Onderzoek",
  viewing: "Bezichtiging",
  offer: "Bod",
  negotiation: "Onderhandeling",
  contract: "Koopakte",
  finance_inspection: "Keuring & financiering",
  transfer: "Overdracht",
};

const LEGACY_CASE_STAGES: Record<string, CaseStage> = {
  profile: "intake",
  shortlist: "research",
  documents: "research",
};

export function isCaseStage(value: unknown): value is CaseStage {
  return typeof value === "string" && CASE_STAGES.includes(value as CaseStage);
}

export function normalizeCaseStage(value: unknown): CaseStage {
  if (typeof value !== "string") return "intake";
  if (isCaseStage(value)) return value;
  return LEGACY_CASE_STAGES[value] ?? "intake";
}

export function caseStageIndex(stage: CaseStage) {
  return CASE_STAGES.indexOf(stage);
}

export function propertyStageFromCase(stage: CaseStage): PropertyStage {
  const map: Record<CaseStage, PropertyStage> = {
    intake: "saved",
    research: "research",
    viewing: "viewing",
    offer: "offer",
    negotiation: "negotiation",
    contract: "accepted",
    finance_inspection: "accepted",
    transfer: "bought",
  };
  return map[stage];
}

export function caseStageFromProperty(stage: PropertyStage): CaseStage {
  const map: Record<PropertyStage, CaseStage> = {
    saved: "intake",
    research: "research",
    viewing: "viewing",
    visited: "viewing",
    offer: "offer",
    offered: "negotiation",
    negotiation: "negotiation",
    accepted: "contract",
    dropped: "research",
    bought: "transfer",
  };
  return map[stage];
}

export type NextAction = {
  title: string;
  text: string;
  href: string;
  urgency: "normal" | "high";
};

export type NextActionInput = {
  profileConfigured: boolean;
  workspaceError?: string;
  savedCount: number;
  propertyStage?: PropertyStage;
  bagVboId?: string;
  caseId?: string;
  caseStage?: CaseStage;
  openTaskTitle?: string;
  openTaskHref?: string;
  openFindings?: number;
  missingCoreDocuments?: boolean;
};

export function nextPurchaseAction(input: NextActionInput): NextAction {
  if (input.workspaceError) {
    return { title: "Koppel je aankoopomgeving", text: "Log in om je profiel, documenten en woningen veilig te bewaren.", href: "/login", urgency: "high" };
  }
  if (!input.profileConfigured) {
    return { title: "Vul je woonprofiel in", text: "Budget, huishouden en must-haves bepalen wat je wél en niet serieus neemt.", href: "/mijn-aankoop#woonprofiel", urgency: "high" };
  }
  if (!input.savedCount) {
    return { title: "Voeg je eerste woning toe", text: "Zoek een adres of plak de gegevens uit een advertentie.", href: "/#zoek-adres", urgency: "normal" };
  }
  if (input.openTaskHref && input.openTaskTitle) {
    return { title: input.openTaskTitle, text: "Dit is de eerstvolgende actie in je dossier.", href: input.openTaskHref, urgency: input.openFindings ? "high" : "normal" };
  }
  if (input.openFindings && input.caseId) {
    return { title: "Bekijk document-aandachtspunten", text: `${input.openFindings} punt${input.openFindings === 1 ? "" : "en"} uit je stukken vragen om een check.`, href: `/mijn-aankoop/${input.caseId}#bevindingen`, urgency: "high" };
  }
  if (input.missingCoreDocuments && input.caseId) {
    return { title: "Upload de verkoopstukken", text: "Brochure, vragenlijst en eventuele VvE-stukken horen in het dossier vóór je biedt.", href: `/mijn-aankoop/${input.caseId}#documenten`, urgency: "high" };
  }

  const caseStage = input.caseStage ?? (input.propertyStage ? caseStageFromProperty(input.propertyStage) : "intake");
  const bagHref = input.bagVboId ? `/woning/${input.bagVboId}` : "/#zoek-adres";
  const caseHref = input.caseId ? `/mijn-aankoop/${input.caseId}` : "/mijn-aankoop";

  const byStage: Record<CaseStage, NextAction> = {
    intake: { title: "Maak het woonprofiel af", text: "Daarna kunnen we woningen tegen jouw grenzen afzetten.", href: "/mijn-aankoop#woonprofiel", urgency: "normal" },
    research: { title: "Werk het woningonderzoek af", text: "Check signalen, upload stukken en noteer wat je nog niet weet.", href: bagHref, urgency: "normal" },
    viewing: { title: "Bereid de bezichtiging voor", text: "Neem de checklist mee en noteer wat je ziet.", href: input.bagVboId ? `${bagHref}/bezichtiging` : bagHref, urgency: "normal" },
    offer: { title: "Maak een bodconcept", text: "Koppel bedrag, risico’s en ontbindende voorwaarden. WoonReality verstuurt niets.", href: `${caseHref}#waarde-bod`, urgency: "normal" },
    negotiation: { title: "Bereid de onderhandeling voor", text: "Houd je maximum en voorwaarden vast. Een tegenbod is geen verplichting.", href: `${caseHref}#waarde-bod`, urgency: "normal" },
    contract: { title: "Controleer de koopakte", text: "Vergelijk koopsom, voorwaarden en opleverdatum met je concept.", href: `${caseHref}#koopakte`, urgency: "high" },
    finance_inspection: { title: "Plan keuring en financiering", text: "Zet de deadlines van je voorbehouden in de agenda.", href: `${caseHref}#koopakte`, urgency: "high" },
    transfer: { title: "Bereid de overdracht voor", text: "Notaris, waarborgsom en opleverpunten horen nu in beeld.", href: caseHref, urgency: "normal" },
  };
  return byStage[caseStage];
}

export function viewingDebriefStage(decision: "continue" | "doubt" | "drop"): { propertyStage: PropertyStage; caseStage: CaseStage; caseStatus?: "active" | "closed" } {
  if (decision === "continue") return { propertyStage: "offer", caseStage: "offer" };
  if (decision === "drop") return { propertyStage: "dropped", caseStage: "research", caseStatus: "closed" };
  return { propertyStage: "visited", caseStage: "viewing" };
}

export function propertyStageLabel(stage: PropertyStage) {
  return PROPERTY_STAGE_LABELS[stage];
}
