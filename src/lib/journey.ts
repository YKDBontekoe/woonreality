import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { propertyStageLabel as purchasePropertyStageLabel, type PropertyStage } from "@/src/lib/purchase";

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

export function caseStageLabel(stage: CaseStage, locale: Locale = "nl"): string {
  return getLibTranslator(locale, "lib-domain")(`journey.stages.${stage}`);
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer caseStageLabel(stage, locale). */
export const CASE_STAGE_LABELS: Record<CaseStage, string> = Object.fromEntries(
  CASE_STAGES.map((stage) => [stage, caseStageLabel(stage)]),
) as Record<CaseStage, string>;

const LEGACY_CASE_STAGES: Record<string, CaseStage> = {
  profile: "intake",
  shortlist: "research",
  documents: "research",
};

export function isCaseStage(value: unknown): value is CaseStage {
  return typeof value === "string" && CASE_STAGES.includes(value as CaseStage);
}

export function isAcceptedCaseStageInput(value: unknown): value is string {
  return isCaseStage(value) || (typeof value === "string" && value in LEGACY_CASE_STAGES);
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

export function nextPurchaseAction(input: NextActionInput, locale: Locale = "nl"): NextAction {
  const t = getLibTranslator(locale, "lib-domain");
  if (input.workspaceError) {
    return { title: t("journey.nextAction.connectWorkspace.title"), text: t("journey.nextAction.connectWorkspace.text"), href: "/login", urgency: "high" };
  }
  if (!input.profileConfigured) {
    return { title: t("journey.nextAction.completeProfile.title"), text: t("journey.nextAction.completeProfile.text"), href: "/mijn-aankoop#woonprofiel", urgency: "high" };
  }
  if (!input.savedCount) {
    return { title: t("journey.nextAction.addFirstProperty.title"), text: t("journey.nextAction.addFirstProperty.text"), href: "/#zoek-adres", urgency: "normal" };
  }
  if (input.openTaskHref && input.openTaskTitle) {
    return { title: input.openTaskTitle, text: t("journey.nextAction.openTask.text"), href: input.openTaskHref, urgency: input.openFindings ? "high" : "normal" };
  }
  if (input.openFindings && input.caseId) {
    return {
      title: t("journey.nextAction.reviewFindings.title"),
      text: t("journey.nextAction.reviewFindings.text", { count: input.openFindings, plural: input.openFindings === 1 ? "" : locale === "en" ? "s" : "en" }),
      href: `/mijn-aankoop/${input.caseId}#bevindingen`,
      urgency: "high",
    };
  }
  if (input.missingCoreDocuments && input.caseId) {
    return { title: t("journey.nextAction.uploadDocuments.title"), text: t("journey.nextAction.uploadDocuments.text"), href: `/mijn-aankoop/${input.caseId}#documenten`, urgency: "high" };
  }

  const caseStage = input.caseStage ?? (input.propertyStage ? caseStageFromProperty(input.propertyStage) : "intake");
  const bagHref = input.bagVboId ? `/woning/${input.bagVboId}` : "/#zoek-adres";
  const caseHref = input.caseId ? `/mijn-aankoop/${input.caseId}` : "/mijn-aankoop";

  const meta: Record<CaseStage, { href: string; urgency: NextAction["urgency"] }> = {
    intake: { href: "/mijn-aankoop#woonprofiel", urgency: "normal" },
    research: { href: bagHref, urgency: "normal" },
    viewing: { href: input.bagVboId ? `${bagHref}/bezichtiging` : bagHref, urgency: "normal" },
    offer: { href: `${caseHref}#waarde-bod`, urgency: "normal" },
    negotiation: { href: `${caseHref}#waarde-bod`, urgency: "normal" },
    contract: { href: `${caseHref}#koopakte`, urgency: "high" },
    finance_inspection: { href: `${caseHref}#koopakte`, urgency: "high" },
    transfer: { href: caseHref, urgency: "normal" },
  };
  return {
    title: t(`journey.nextAction.stages.${caseStage}.title`),
    text: t(`journey.nextAction.stages.${caseStage}.text`),
    href: meta[caseStage].href,
    urgency: meta[caseStage].urgency,
  };
}

export function viewingDebriefStage(decision: "continue" | "doubt" | "drop"): { propertyStage: PropertyStage; caseStage: CaseStage; caseStatus?: "active" | "closed" } {
  if (decision === "continue") return { propertyStage: "offer", caseStage: "offer" };
  if (decision === "drop") return { propertyStage: "dropped", caseStage: "research", caseStatus: "closed" };
  return { propertyStage: "visited", caseStage: "viewing" };
}

export function propertyStageLabel(stage: PropertyStage, locale: Locale = "nl") {
  return purchasePropertyStageLabel(stage, locale);
}
