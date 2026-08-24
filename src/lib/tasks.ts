import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { computePurchaseDeadlines } from "@/src/lib/deadlines";
import { caseStageLabel, type CaseStage } from "@/src/lib/journey";
import { profileCompletion, type BuyerProfile } from "@/src/lib/purchase";

export type TaskSuggestion = {
  key: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high";
  source: string;
  href?: string;
  /** ISO date-time; set for legal/contractual deadlines the deadline engine computed. */
  dueAt?: string;
};

export type TaskEngineInput = {
  profile?: BuyerProfile | null;
  profileConfigured: boolean;
  stage: CaseStage;
  bagVboId?: string | null;
  caseId: string;
  documentTypes: string[];
  openFindings: Array<{ title: string; severity: string; action?: string | null }>;
  hasAskingPrice: boolean;
  hasOffer: boolean;
  hasContractAmount: boolean;
  checklistComplete?: boolean;
  attentionActions?: string[];
  /** ISO date (yyyy-mm-dd) the signed koopovereenkomst was received; drives bedenktijd. */
  contractReceivedAt?: string | null;
  /** ISO date (yyyy-mm-dd) the koopovereenkomst was signed; drives voorbehoud deadlines. */
  contractSignedAt?: string | null;
  financingWeeks?: number | null;
  inspectionWeeks?: number | null;
};

export function taskSource(key: string) {
  return `engine:${key}`;
}

export function suggestCaseTasks(input: TaskEngineInput, locale: Locale = "nl"): TaskSuggestion[] {
  const t = getLibTranslator(locale, "lib-domain");
  const tasks: TaskSuggestion[] = [];
  const caseHref = `/mijn-aankoop/${input.caseId}`;
  const bagHref = input.bagVboId ? `/woning/${input.bagVboId}` : "/#zoek-adres";
  const completion = input.profile && input.profileConfigured ? profileCompletion(input.profile) : 0;

  if (!input.profileConfigured || completion < 80) {
    tasks.push({
      key: "profile",
      title: t("tasks.profile.title"),
      description: t("tasks.profile.description"),
      priority: "high",
      source: taskSource("profile"),
      href: "/mijn-aankoop#woonprofiel",
    });
  }

  if (!input.documentTypes.includes("brochure") && !input.documentTypes.includes("vragenlijst")) {
    tasks.push({
      key: "docs-core",
      title: t("tasks.docsCore.title"),
      description: t("tasks.docsCore.description"),
      priority: "high",
      source: taskSource("docs-core"),
      href: `${caseHref}#documenten`,
    });
  }

  if (input.documentTypes.some((type) => type === "brochure" || type === "overig") && !input.documentTypes.includes("vragenlijst")) {
    tasks.push({
      key: "docs-vragenlijst",
      title: t("tasks.docsQuestionnaire.title"),
      description: t("tasks.docsQuestionnaire.description"),
      priority: "normal",
      source: taskSource("docs-vragenlijst"),
      href: `${caseHref}#documenten`,
    });
  }

  if (!input.documentTypes.includes("vve") && (input.profile?.propertyType === "apartment" || input.profile?.acceptVve)) {
    tasks.push({
      key: "docs-vve",
      title: t("tasks.docsVve.title"),
      description: t("tasks.docsVve.description"),
      priority: "high",
      source: taskSource("docs-vve"),
      href: `${caseHref}#documenten`,
    });
  }

  for (const finding of input.openFindings.filter((item) => item.severity === "high").slice(0, 3)) {
    tasks.push({
      key: `finding-${finding.title.slice(0, 40)}`,
      title: finding.title,
      description: finding.action || t("tasks.findingFallback"),
      priority: "high",
      source: taskSource(`finding-${finding.title}`),
      href: `${caseHref}#bevindingen`,
    });
  }

  if (input.attentionActions?.length && (input.stage === "research" || input.stage === "viewing" || input.stage === "intake")) {
    tasks.push({
      key: "viewing-signals",
      title: t("tasks.viewingSignals.title"),
      description: input.attentionActions.slice(0, 2).join(" "),
      priority: "normal",
      source: taskSource("viewing-signals"),
      href: input.bagVboId ? `${bagHref}/bezichtiging` : bagHref,
    });
  }

  if (!input.hasAskingPrice && ["research", "viewing", "offer"].includes(input.stage)) {
    tasks.push({
      key: "asking-price",
      title: t("tasks.askingPrice.title"),
      description: t("tasks.askingPrice.description"),
      priority: "normal",
      source: taskSource("asking-price"),
      href: `${caseHref}#waarde-bod`,
    });
  }

  if (input.stage === "viewing" && input.checklistComplete === false) {
    tasks.push({
      key: "viewing-checklist",
      title: t("tasks.viewingChecklist.title"),
      description: t("tasks.viewingChecklist.description"),
      priority: "high",
      source: taskSource("viewing-checklist"),
      href: input.bagVboId ? `${bagHref}/bezichtiging` : bagHref,
    });
  }

  if (["offer", "negotiation"].includes(input.stage) && !input.hasOffer) {
    tasks.push({
      key: "bid-draft",
      title: t("tasks.bidDraft.title"),
      description: t("tasks.bidDraft.description"),
      priority: "high",
      source: taskSource("bid-draft"),
      href: `${caseHref}#waarde-bod`,
    });
  }

  if (input.stage === "contract" && !input.hasContractAmount) {
    tasks.push({
      key: "contract-check",
      title: t("tasks.contractCheck.title"),
      description: t("tasks.contractCheck.description"),
      priority: "high",
      source: taskSource("contract-check"),
      href: `${caseHref}#koopakte`,
    });
  }

  if (input.stage === "finance_inspection") {
    tasks.push({
      key: "inspection-book",
      title: t("tasks.inspectionBook.title"),
      description: t("tasks.inspectionBook.description", { stage: caseStageLabel("finance_inspection", locale) }),
      priority: "high",
      source: taskSource("inspection-book"),
      href: `${caseHref}#koopakte`,
    });
  }

  if (input.contractSignedAt || input.contractReceivedAt) {
    const signedDate = input.contractSignedAt ? new Date(`${input.contractSignedAt}T00:00:00`) : null;
    const receivedDate = input.contractReceivedAt
      ? new Date(`${input.contractReceivedAt}T00:00:00`)
      : signedDate;
    if ((signedDate && !Number.isNaN(signedDate.getTime())) || (receivedDate && !Number.isNaN(receivedDate.getTime()))) {
      const deadlines = computePurchaseDeadlines({
        contractReceivedAt: receivedDate && !Number.isNaN(receivedDate.getTime()) ? receivedDate : null,
        contractSignedAt: signedDate && !Number.isNaN(signedDate.getTime()) ? signedDate : null,
        financingWeeks: input.financingWeeks,
        inspectionWeeks: input.inspectionWeeks,
      });
      const formatDate = (date: Date) => date.toLocaleDateString(locale === "en" ? "en-IE" : "nl-NL", { dateStyle: "long" });
      for (const deadline of deadlines) {
        const isPast = deadline.dueAt.getTime() < Date.now();
        if (isPast) continue;
        tasks.push({
          key: `deadline-${deadline.key}`,
          title: t(`tasks.deadlines.${deadline.key}.title`),
          description: t(`tasks.deadlines.${deadline.key}.description`, { date: formatDate(deadline.dueAt) }),
          priority: "high",
          source: taskSource(`deadline-${deadline.key}`),
          href: `${caseHref}#koopakte`,
          dueAt: deadline.dueAt.toISOString(),
        });
      }
    }
  }

  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.key)) return false;
    seen.add(task.key);
    return true;
  });
}

export function hrefForTask(task: { source?: string | null; title?: string | null; href?: string | null }, fallback: { caseId: string; bagVboId?: string | null }) {
  if (task.href) return task.href;
  const source = task.source ?? "";
  const caseHref = `/mijn-aankoop/${fallback.caseId}`;
  if (source.startsWith("engine:finding-")) return `${caseHref}#bevindingen`;
  if (source.startsWith("engine:docs-")) return `${caseHref}#documenten`;
  if (source === "engine:contract-check" || source === "engine:inspection-book") return `${caseHref}#koopakte`;
  if (source === "engine:profile") return "/mijn-aankoop#woonprofiel";
  if (source === "engine:viewing-signals" || source === "engine:viewing-checklist") {
    return fallback.bagVboId ? `/woning/${fallback.bagVboId}/bezichtiging` : caseHref;
  }
  if (source === "engine:asking-price" || source === "engine:bid-draft") return `${caseHref}#waarde-bod`;
  if (/profiel|profile/i.test(task.title ?? "")) return "/mijn-aankoop#woonprofiel";
  if (/bezichtig|viewing/i.test(task.title ?? "") && fallback.bagVboId) return `/woning/${fallback.bagVboId}/bezichtiging`;
  if (/document|upload|vve|vragenlijst|brochure|questionnaire/i.test(task.title ?? "")) return `${caseHref}#documenten`;
  if (/bod|vraagprijs|offer|bid|asking price/i.test(task.title ?? "")) return `${caseHref}#waarde-bod`;
  return caseHref;
}
