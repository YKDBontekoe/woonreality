import type { Analysis, ChecklistItem } from "@/src/lib/types";

const genericItems: ChecklistItem[] = [
  { id: "windows", label: "Luister met ramen open én dicht", checked: false },
  { id: "light", label: "Check licht, schaduw en geveloriëntatie", checked: false },
  { id: "vve", label: "Vraag om VvE-notulen, begroting, reservefonds, MJOP en verzekeringspolis", checked: false },
  { id: "legal", label: "Controleer splitsingsakte, erfpacht/eigen grond en gebruiksbeperkingen", checked: false },
  { id: "condition", label: "Plan een bouwkundige keuring", checked: false },
];

export function checklistForAnalysis(analysis: Analysis): ChecklistItem[] {
  const signalItems = analysis.signals
    .filter((signal) => signal.severity === "attention")
    .map((signal) => ({
      id: `signal-${signal.key}`,
      label: signal.action,
      reason: signal.summary,
      signalKey: signal.key,
      checked: false,
    }));
  return [...signalItems, ...genericItems].filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label) === index);
}

export function listingQuestionItem(topic: string, question: string): ChecklistItem {
  const raw = `${topic}\u001f${question}`.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) {
    hash = Math.imul(hash, 33) ^ raw.charCodeAt(index);
  }
  return {
    id: `listing-q-${(hash >>> 0).toString(16)}`,
    label: question,
    reason: topic,
    checked: false,
  };
}

export function mergeChecklistWithDefaults(defaults: ChecklistItem[], persisted: ChecklistItem[]) {
  const persistedById = new Map(persisted.map((item) => [item.id, item]));
  const currentItems = defaults.map((item) => {
    const previous = persistedById.get(item.id);
    return previous ? { ...item, checked: previous.checked, note: previous.note } : item;
  });
  const customItems = persisted.filter((item) => {
    if (defaults.some((candidate) => candidate.id === item.id)) return false;
    if (item.id.startsWith("listing-q-")) return false;
    return true;
  });
  return [...currentItems, ...customItems];
}
