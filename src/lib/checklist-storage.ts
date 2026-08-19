import type { ChecklistItem } from "@/src/lib/types";

const SESSION_CHECKLIST_PREFIX = "woonreality.checklist.";

export const checklistSessionNotice = "Je checklist blijft in deze browsersessie bewaard. Log in om notities blijvend op te slaan.";

export function checklistSessionStorageKey(bagId: string) {
  return `${SESSION_CHECKLIST_PREFIX}${bagId}`;
}

function isChecklistItem(value: unknown): value is ChecklistItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string"
    && typeof item.label === "string"
    && typeof item.checked === "boolean"
    && (item.note == null || typeof item.note === "string")
    && (item.reason == null || typeof item.reason === "string")
    && (item.signalKey == null || typeof item.signalKey === "string");
}

export function loadSessionChecklist(bagId: string): ChecklistItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(checklistSessionStorageKey(bagId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(isChecklistItem) ? value : null;
  } catch {
    return null;
  }
}

export function saveSessionChecklist(bagId: string, items: ChecklistItem[]) {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(checklistSessionStorageKey(bagId), JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function supportsSessionChecklistFallback(status: number) {
  return status === 401 || status === 502 || status === 503;
}
