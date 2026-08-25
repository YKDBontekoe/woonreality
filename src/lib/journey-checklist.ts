import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type { CaseStage } from "@/src/lib/journey";
import { CASE_STAGES } from "@/src/lib/journey";

export type JourneyChecklistItem = {
  id: string;
  label: string;
  hint?: string;
};

export type JourneyStageChecklist = {
  stage: CaseStage;
  items: JourneyChecklistItem[];
};

/**
 * A static, end-to-end map of the whole buying journey (search -> keys),
 * covering the parts an aankoopmakelaar normally walks a buyer through
 * stage by stage. This is deliberately informational, not another
 * checkbox store: the concrete, stateful to-dos for "now" already live in
 * the dynamic task engine (src/lib/tasks.ts), the viewing checklist
 * (src/lib/checklist.ts) and document findings. This module gives the
 * buyer the whole map so nothing later in the process comes as a surprise.
 */
const STAGE_ITEM_IDS: Record<CaseStage, readonly string[]> = {
  intake: ["budget", "profile", "nhg"],
  research: ["analysis", "compare", "listing", "ai"],
  viewing: ["checklist", "questions", "debrief"],
  offer: ["strategy", "conditions", "valuation"],
  negotiation: ["counter", "escalation", "walkaway"],
  contract: ["review", "deadlines", "clauses"],
  finance_inspection: ["mortgage", "inspection", "documents"],
  transfer: ["final-inspection", "notary", "keys"],
};

export function journeyChecklist(locale: Locale = "nl"): JourneyStageChecklist[] {
  const t = getLibTranslator(locale, "lib-domain");
  return CASE_STAGES.map((stage) => ({
    stage,
    items: STAGE_ITEM_IDS[stage].map((id) => ({ id, label: t(`journey.checklist.${stage}.${id}`) })),
  }));
}

export function journeyChecklistForStage(stage: CaseStage, locale: Locale = "nl"): JourneyChecklistItem[] {
  return journeyChecklist(locale).find((entry) => entry.stage === stage)?.items ?? [];
}

export function journeyStageStatus(stage: CaseStage, currentStage: CaseStage): "done" | "current" | "upcoming" {
  const stageIndex = CASE_STAGES.indexOf(stage);
  const currentIndex = CASE_STAGES.indexOf(currentStage);
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "current";
  return "upcoming";
}
