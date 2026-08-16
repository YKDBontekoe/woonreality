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
export const JOURNEY_CHECKLIST: JourneyStageChecklist[] = [
  {
    stage: "intake",
    items: [
      { id: "budget", label: "Bereken je hypotheekbudget ná kosten koper, niet ervoor." },
      { id: "profile", label: "Leg je woonwensen en prioriteiten vast (locatie, type, budget, must-haves)." },
      { id: "nhg", label: "Check of Nationale Hypotheek Garantie (NHG) voor jou van toepassing en verstandig is." },
    ],
  },
  {
    stage: "research",
    items: [
      { id: "analysis", label: "Lees de woningcheck en de aandachtspunten per domein, niet alleen het eindcijfer." },
      { id: "compare", label: "Vergelijk kandidaat-woningen naast elkaar op prijs, m², energie en VvE-signalen." },
      { id: "listing", label: "Koppel de Funda-advertentie zodat vraagprijs, kenmerken en VvE-gegevens meegenomen worden." },
      { id: "ai", label: "Vraag het AI-onderzoek aan voor extra context (vergunningen, gemeentelijke plannen, contradicties)." },
    ],
  },
  {
    stage: "viewing",
    items: [
      { id: "checklist", label: "Loop de bezichtigingschecklist na, inclusief de aandachtspunten uit de woningcheck." },
      { id: "questions", label: "Stel de vragen die uit de AI-analyse of documentcheck naar voren komen." },
      { id: "debrief", label: "Leg direct na afloop vast: doorgaan, twijfel, of laten vallen — en waarom." },
    ],
  },
  {
    stage: "offer",
    items: [
      { id: "strategy", label: "Bepaal je bod met de biedstrategie: voorzichtig, gebalanceerd of sterk, op basis van de risico's." },
      { id: "conditions", label: "Houd financierings- en keuringsvoorbehoud aan, zeker als starter of bij open aandachtspunten." },
      { id: "valuation", label: "Realiseer je: geen taxatie betekent geen bevestigde marktwaarde. Bied nooit blind boven de vraagprijs." },
    ],
  },
  {
    stage: "negotiation",
    items: [
      { id: "counter", label: "Bij een tegenbod: pas alleen bedrag of voorwaarden aan, niet allebei tegelijk zonder reden." },
      { id: "escalation", label: "Overweeg bij concurrentie een ophoogclausule in plaats van blind hoger bieden." },
      { id: "walkaway", label: "Ken vooraf je maximale prijs en wees bereid om af te haken als die wordt overschreden." },
    ],
  },
  {
    stage: "contract",
    items: [
      { id: "review", label: "Laat de koopakte controleren vóór ondertekening; vergelijk het bedrag met je bod." },
      { id: "deadlines", label: "Zet bedenktijd en de deadlines van je voorbehouden meteen in je agenda." },
      { id: "clauses", label: "Vraag uitleg bij bijzondere clausules (ouderdomsclausule, asbestclausule, erfpacht)." },
    ],
  },
  {
    stage: "finance_inspection",
    items: [
      { id: "mortgage", label: "Rond de hypotheekaanvraag af ruim vóór de financieringsdeadline." },
      { id: "inspection", label: "Plan de bouwkundige keuring en behandel de bevindingen vóór de keuringsdeadline." },
      { id: "documents", label: "Vraag ontbrekende stukken op (VvE, MJOP, bouwtekeningen, energie) en laat ze meewegen." },
    ],
  },
  {
    stage: "transfer",
    items: [
      { id: "final-inspection", label: "Doe de eindinspectie vlak vóór de overdracht en noteer opleverpunten schriftelijk." },
      { id: "notary", label: "Controleer de nota van afrekening en de conceptakte bij de notaris vóór het passeren." },
      { id: "keys", label: "Regel waarborgsom/bankgarantie, verzekeringen en de sleuteloverdracht." },
    ],
  },
];

export function journeyChecklistForStage(stage: CaseStage): JourneyChecklistItem[] {
  return JOURNEY_CHECKLIST.find((entry) => entry.stage === stage)?.items ?? [];
}

export function journeyStageStatus(stage: CaseStage, currentStage: CaseStage): "done" | "current" | "upcoming" {
  const stageIndex = CASE_STAGES.indexOf(stage);
  const currentIndex = CASE_STAGES.indexOf(currentStage);
  if (stageIndex < currentIndex) return "done";
  if (stageIndex === currentIndex) return "current";
  return "upcoming";
}
