import type { Analysis, ChecklistItem } from "@/src/lib/types";

const genericItems: ChecklistItem[] = [
  { id: "windows", label: "Luister met ramen open én dicht", checked: false },
  { id: "light", label: "Check licht, schaduw en geveloriëntatie", checked: false },
  { id: "neighbors", label: "Vraag naar buren, VvE en servicekosten", checked: false },
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

