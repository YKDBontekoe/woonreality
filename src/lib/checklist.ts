import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type { Analysis, ChecklistItem } from "@/src/lib/types";

const GENERIC_ITEM_IDS = ["windows", "light", "vve", "legal", "condition"] as const;

function genericItems(locale: Locale): ChecklistItem[] {
  const t = getLibTranslator(locale, "lib-domain");
  return GENERIC_ITEM_IDS.map((id) => ({ id, label: t(`checklist.items.${id}`), checked: false }));
}

export function checklistForAnalysis(analysis: Analysis, locale: Locale = "nl"): ChecklistItem[] {
  const signalItems = analysis.signals
    .filter((signal) => signal.severity === "attention")
    .map((signal) => ({
      id: `signal-${signal.key}`,
      label: signal.action,
      reason: signal.summary,
      signalKey: signal.key,
      checked: false,
    }));
  return [...signalItems, ...genericItems(locale)].filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label) === index);
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
