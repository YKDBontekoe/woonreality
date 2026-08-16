import { computePurchaseDeadlines } from "@/src/lib/deadlines";
import { CASE_STAGE_LABELS, type CaseStage } from "@/src/lib/journey";
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

export function suggestCaseTasks(input: TaskEngineInput): TaskSuggestion[] {
  const tasks: TaskSuggestion[] = [];
  const caseHref = `/mijn-aankoop/${input.caseId}`;
  const bagHref = input.bagVboId ? `/woning/${input.bagVboId}` : "/#zoek-adres";
  const completion = input.profile && input.profileConfigured ? profileCompletion(input.profile) : 0;

  if (!input.profileConfigured || completion < 80) {
    tasks.push({
      key: "profile",
      title: "Vul je woonprofiel in",
      description: "Budget, huishouden en must-haves horen vast te staan voordat je een bod serieus maakt.",
      priority: "high",
      source: taskSource("profile"),
      href: "/mijn-aankoop#woonprofiel",
    });
  }

  if (!input.documentTypes.includes("brochure") && !input.documentTypes.includes("vragenlijst")) {
    tasks.push({
      key: "docs-core",
      title: "Upload brochure of vragenlijst",
      description: "Zonder verkoopstukken zie je alleen open data. De makelaar zou deze stukken nu opvragen.",
      priority: "high",
      source: taskSource("docs-core"),
      href: `${caseHref}#documenten`,
    });
  }

  if (input.documentTypes.some((type) => type === "brochure" || type === "overig") && !input.documentTypes.includes("vragenlijst")) {
    tasks.push({
      key: "docs-vragenlijst",
      title: "Vraag de vragenlijst van de verkoper",
      description: "Lekkage, geschillen en verbouwingen staan zelden in de brochure.",
      priority: "normal",
      source: taskSource("docs-vragenlijst"),
      href: `${caseHref}#documenten`,
    });
  }

  if (!input.documentTypes.includes("vve") && (input.profile?.propertyType === "apartment" || input.profile?.acceptVve)) {
    tasks.push({
      key: "docs-vve",
      title: "Upload VvE-stukken",
      description: "Notulen, MJOP, reservefonds en bijdrage horen in het dossier vóór je biedt.",
      priority: "high",
      source: taskSource("docs-vve"),
      href: `${caseHref}#documenten`,
    });
  }

  for (const finding of input.openFindings.filter((item) => item.severity === "high").slice(0, 3)) {
    tasks.push({
      key: `finding-${finding.title.slice(0, 40)}`,
      title: finding.title,
      description: finding.action || "Bekijk dit aandachtspunt in je documentdossier.",
      priority: "high",
      source: taskSource(`finding-${finding.title}`),
      href: `${caseHref}#bevindingen`,
    });
  }

  if (input.attentionActions?.length && (input.stage === "research" || input.stage === "viewing" || input.stage === "intake")) {
    tasks.push({
      key: "viewing-signals",
      title: "Neem de aandachtspunten mee naar de bezichtiging",
      description: input.attentionActions.slice(0, 2).join(" "),
      priority: "normal",
      source: taskSource("viewing-signals"),
      href: input.bagVboId ? `${bagHref}/bezichtiging` : bagHref,
    });
  }

  if (!input.hasAskingPrice && ["research", "viewing", "offer"].includes(input.stage)) {
    tasks.push({
      key: "asking-price",
      title: "Vul de vraagprijs in",
      description: "Zonder vraagprijs kunnen we geen bodconcept of kosten koper schetsen.",
      priority: "normal",
      source: taskSource("asking-price"),
      href: `${caseHref}#waarde-bod`,
    });
  }

  if (input.stage === "viewing" && input.checklistComplete === false) {
    tasks.push({
      key: "viewing-checklist",
      title: "Werk de bezichtigingschecklist af",
      description: "Vink af wat je gezien hebt en noteer twijfels voordat je een bod voorbereidt.",
      priority: "high",
      source: taskSource("viewing-checklist"),
      href: input.bagVboId ? `${bagHref}/bezichtiging` : bagHref,
    });
  }

  if (["offer", "negotiation"].includes(input.stage) && !input.hasOffer) {
    tasks.push({
      key: "bid-draft",
      title: "Bewaar een bodconcept",
      description: "Bedrag, voorwaarden en je maximum horen op papier — nog niet in een mail naar de makelaar.",
      priority: "high",
      source: taskSource("bid-draft"),
      href: `${caseHref}#waarde-bod`,
    });
  }

  if (input.stage === "contract" && !input.hasContractAmount) {
    tasks.push({
      key: "contract-check",
      title: "Vergelijk koopsom met je bod",
      description: "Een afwijkend bedrag in de akte is een stopteken, geen detail.",
      priority: "high",
      source: taskSource("contract-check"),
      href: `${caseHref}#koopakte`,
    });
  }

  if (input.stage === "finance_inspection") {
    tasks.push({
      key: "inspection-book",
      title: "Plan de bouwkundige keuring",
      description: `Je zit in ${CASE_STAGE_LABELS.finance_inspection}. Zet de deadline van het voorbehoud in je agenda.`,
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
      const formatDate = (date: Date) => date.toLocaleDateString("nl-NL", { dateStyle: "long" });
      for (const deadline of deadlines) {
        const isPast = deadline.dueAt.getTime() < Date.now();
        if (isPast) continue;
        const copy: Record<typeof deadline.key, { title: string; description: string }> = {
          bedenktijd: {
            title: "Bedenktijd loopt af",
            description: `Tot en met ${formatDate(deadline.dueAt)} kun je nog kosteloos terugtreden (Art. 7:2 BW), zonder opgaaf van reden.`,
          },
          financing: {
            title: "Voorbehoud van financiering vervalt",
            description: `Regel je hypotheek (afwijzing of toezegging) vóór ${formatDate(deadline.dueAt)}, anders vervalt je ontbindende voorwaarde.`,
          },
          inspection: {
            title: "Voorbehoud van bouwkundige keuring vervalt",
            description: `Plan en verwerk de bouwkundige keuring vóór ${formatDate(deadline.dueAt)} om nog kosteloos te kunnen ontbinden.`,
          },
        };
        tasks.push({
          key: `deadline-${deadline.key}`,
          title: copy[deadline.key].title,
          description: copy[deadline.key].description,
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
  if (/profiel/i.test(task.title ?? "")) return "/mijn-aankoop#woonprofiel";
  if (/bezichtig/i.test(task.title ?? "") && fallback.bagVboId) return `/woning/${fallback.bagVboId}/bezichtiging`;
  if (/document|upload|vve|vragenlijst|brochure/i.test(task.title ?? "")) return `${caseHref}#documenten`;
  if (/bod|vraagprijs/i.test(task.title ?? "")) return `${caseHref}#waarde-bod`;
  return caseHref;
}
