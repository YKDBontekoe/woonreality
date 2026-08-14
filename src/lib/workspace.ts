import type { PersonalPreferences, SavedProperty } from "@/src/lib/types";
import { DEFAULT_PREFERENCES } from "@/src/lib/personalization";

export const WORKSPACE_KEY = "woonreality:v1";

export type WorkspaceData = {
  preferences: PersonalPreferences;
  preferencesConfigured: boolean;
  saved: SavedProperty[];
  compare: string[];
};

export const emptyWorkspace = (): WorkspaceData => ({
  preferences: { ...DEFAULT_PREFERENCES },
  preferencesConfigured: false,
  saved: [],
  compare: [],
});

export function readWorkspace(): WorkspaceData {
  if (typeof window === "undefined") return emptyWorkspace();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY) ?? "null") as Partial<WorkspaceData> | null;
    return {
      ...emptyWorkspace(),
      ...parsed,
      preferences: { ...DEFAULT_PREFERENCES, ...(parsed?.preferences ?? {}) },
      saved: Array.isArray(parsed?.saved) ? parsed.saved : [],
      compare: Array.isArray(parsed?.compare) ? parsed.compare.slice(0, 4) : [],
    };
  } catch {
    return emptyWorkspace();
  }
}

export function writeWorkspace(data: WorkspaceData) {
  if (typeof window !== "undefined") window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data));
}

