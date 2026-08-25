"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ListingHistoryItem } from "@/src/lib/listing-history";
import type { PersonalPreferences, Property } from "@/src/lib/types";
import { emptyWorkspace, type WorkspaceData } from "@/src/lib/workspace";
import { parseCurrentHome } from "@/src/lib/current-home";
import type { BuyerProfile, PropertyStage } from "@/src/lib/purchase";
import type { CalculatorState } from "@/src/lib/mortgage/calculator-state";
import { bagIdSchema, type WorkspaceRequest } from "@/src/lib/validation/workspace";
import { apiFetch, redirectToLogin } from "@/components/hooks/use-api";
import { listingStorageKey } from "@/src/lib/listing-intake";

export type WorkspaceMutationResult = { ok: true } | { ok: false; error: string };
export type WorkspaceAuthStatus = "unknown" | "authenticated" | "anonymous";

const SESSION_COMPARE_KEY = "woonreality.compare";
const LOCAL_CURRENT_HOME_KEY = "woonreality.currentHome";

function isBagId(value: unknown): value is string {
  return bagIdSchema.safeParse(value).success;
}

function sessionCompare(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(SESSION_COMPARE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isBagId).slice(0, 4) : [];
  } catch {
    return [];
  }
}

function saveSessionCompare(compare: string[]) {
  try {
    window.sessionStorage.setItem(SESSION_COMPARE_KEY, JSON.stringify(compare));
  } catch {
    // The comparison still works in memory if browser storage is unavailable.
  }
}

function localCurrentHome() {
  if (typeof window === "undefined") return null;
  try {
    return parseCurrentHome(JSON.parse(window.localStorage.getItem(LOCAL_CURRENT_HOME_KEY) ?? "null"));
  } catch {
    return null;
  }
}

function saveLocalCurrentHome(home: WorkspaceData["currentHome"]) {
  try {
    if (home) window.localStorage.setItem(LOCAL_CURRENT_HOME_KEY, JSON.stringify(home));
    else window.localStorage.removeItem(LOCAL_CURRENT_HOME_KEY);
  } catch {
    // The baseline still works in memory if browser storage is unavailable.
  }
}

type WorkspaceContextValue = {
  workspace: WorkspaceData;
  workspaceReady: boolean;
  workspaceError: string;
  authStatus: WorkspaceAuthStatus;
  authenticated: boolean;
  toggleSaved: (property: Property, askingPrice?: number | null) => Promise<WorkspaceMutationResult>;
  toggleCompare: (bagVboId: string) => Promise<void>;
  setCurrentHome: (property: Property) => Promise<WorkspaceMutationResult>;
  clearCurrentHome: () => Promise<WorkspaceMutationResult>;
  saveHistoryItem: (item: ListingHistoryItem) => Promise<WorkspaceMutationResult>;
  removeListingHistory: (bagVboId: string) => Promise<WorkspaceMutationResult>;
  setPreferences: (preferences: PersonalPreferences) => Promise<WorkspaceMutationResult>;
  setBuyerProfile: (buyerProfile: BuyerProfile) => Promise<WorkspaceMutationResult>;
  setPropertyStage: (bagVboId: string, stage: PropertyStage) => Promise<WorkspaceMutationResult>;
  setMortgageState: (mortgageState: CalculatorState) => Promise<WorkspaceMutationResult>;
  setListingPrice: (bagVboId: string, askingPrice: number) => Promise<WorkspaceMutationResult>;
  dismissOnboarding: () => Promise<WorkspaceMutationResult>;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common");
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => emptyWorkspace());
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<WorkspaceAuthStatus>("unknown");

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<{ workspace?: WorkspaceData; error?: string }>("/api/workspace", { cache: "no-store" });
      if (result.status === 401) {
        setAuthStatus("anonymous");
        // A comparison is useful before someone creates an account. Keep that
        // lightweight public workflow available, without suggesting the rest
        // of the purchase workspace is stored for this visitor.
        setWorkspace((current) => ({ ...current, compare: sessionCompare(), currentHome: localCurrentHome() }));
        setWorkspaceError("");
        return;
      }
      if (result.status === 503) {
        setWorkspace((current) => ({ ...current, compare: sessionCompare(), currentHome: localCurrentHome() }));
        setWorkspaceError(t("workspaceUnavailable"));
        return;
      }
      if (!result.ok || !result.data?.workspace) throw new Error(result.data?.error ?? t("workspaceLoadFailed"));
      setWorkspace(result.data.workspace);
      setAuthStatus("authenticated");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : t("workspaceLoadFailed"));
    } finally {
      setWorkspaceReady(true);
    }
  }, [t]);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (payload: WorkspaceRequest): Promise<WorkspaceMutationResult> => {
    try {
      const result = await apiFetch<{ workspace?: WorkspaceData; error?: string }>("/api/workspace", { method: "POST", json: payload });
      // Vergelijken en de huidige woning blijven bruikbaar zonder account:
      // bewaar ze lokaal in plaats van te eisen dat iemand inlogt.
      const sessionFallback = payload.action === "compare"
        || payload.action === "setCurrentHome"
        || payload.action === "clearCurrentHome";
      if ((result.status === 401 || result.status === 502 || result.status === 503) && sessionFallback && authStatus !== "authenticated") {
        if (result.status === 401) setAuthStatus("anonymous");
        if (payload.action === "compare") {
          const compare = payload.compare.filter(isBagId).slice(0, 4);
          saveSessionCompare(compare);
          setWorkspace((current) => ({ ...current, compare }));
        } else {
          const home = payload.action === "setCurrentHome"
            ? {
              bagVboId: payload.bagVboId,
              addressLabel: payload.addressLabel,
              city: payload.city,
              postcode: payload.postcode,
              savedAt: new Date().toISOString(),
              askingPrice: null,
            }
            : null;
          saveLocalCurrentHome(home);
          setWorkspace((current) => ({ ...current, currentHome: home }));
        }
        setWorkspaceError(payload.action === "compare" ? t("compareSessionNotice") : t("currentHomeSessionNotice"));
        return { ok: true };
      }
      if (result.status === 401) {
        setAuthStatus("anonymous");
        redirectToLogin();
        return { ok: false, error: t("loginToSaveChanges") };
      }
      if (!result.ok || !result.data?.workspace) throw new Error(result.data?.error ?? t("saveChangeFailed"));
      setWorkspace(result.data.workspace);
      setAuthStatus("authenticated");
      setWorkspaceError("");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : t("saveChangeFailed");
      setWorkspaceError(message);
      return { ok: false, error: message };
    }
  }, [authStatus, t]);

  const toggleSaved = useCallback(async (property: Property, askingPrice?: number | null) => {
    const exists = workspace.saved.some((item) => item.bagVboId === property.bagVboId);
    return mutate(exists
      ? { action: "unsave", bagVboId: property.bagVboId }
      : {
        action: "save",
        bagVboId: property.bagVboId,
        addressLabel: property.addressLabel,
        city: property.city,
        postcode: property.postcode,
        ...(askingPrice && askingPrice > 0 ? { askingPrice } : {}),
      });
  }, [mutate, workspace.saved]);

  const toggleCompare = useCallback(async (bagVboId: string) => {
    const compare = workspace.compare.includes(bagVboId) ? workspace.compare.filter((id) => id !== bagVboId) : workspace.compare.length >= 4 ? workspace.compare : [...workspace.compare, bagVboId];
    await mutate({ action: "compare", compare });
  }, [mutate, workspace.compare]);

  const setCurrentHome = useCallback(async (property: Property) => mutate({
    action: "setCurrentHome",
    bagVboId: property.bagVboId,
    addressLabel: property.addressLabel,
    city: property.city,
    postcode: property.postcode,
  }), [mutate]);

  const clearCurrentHome = useCallback(async () => mutate({ action: "clearCurrentHome" }), [mutate]);

  const saveHistoryItem = useCallback(async (item: ListingHistoryItem) => {
    const exists = workspace.saved.some((saved) => saved.bagVboId === item.bagVboId);
    if (exists) return { ok: true } as const;
    return mutate({
      action: "save",
      bagVboId: item.bagVboId,
      addressLabel: item.addressLabel,
      city: item.city || t("unknownCity"),
      postcode: item.postcode || t("unknownPostcode"),
      ...(item.askingPrice && item.askingPrice > 0 ? { askingPrice: item.askingPrice } : {}),
    });
  }, [mutate, t, workspace.saved]);

  const removeListingHistory = useCallback(async (bagVboId: string): Promise<WorkspaceMutationResult> => {
    try {
      const result = await apiFetch<{ error?: string }>(`/api/listing/user/${encodeURIComponent(bagVboId)}`, { method: "DELETE" });
      if (result.status === 401) {
        setAuthStatus("anonymous");
        redirectToLogin();
        return { ok: false, error: t("loginToSaveChanges") };
      }
      if (!result.ok) throw new Error(result.data?.error ?? result.error ?? t("removeHistoryFailed"));
      // Without this the session draft would resurrect the deleted advert on
      // the next property-page visit.
      try { window.sessionStorage.removeItem(listingStorageKey(bagVboId)); } catch { /* ignore */ }
      await refresh();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : t("removeHistoryFailed");
      setWorkspaceError(message);
      return { ok: false, error: message };
    }
  }, [refresh, t]);

  const setPreferences = useCallback(async (preferences: PersonalPreferences) => mutate({ action: "profile", preferences }), [mutate]);

  const setBuyerProfile = useCallback(async (buyerProfile: BuyerProfile) => mutate({ action: "profile", buyerProfile }), [mutate]);

  const setPropertyStage = useCallback(async (bagVboId: string, stage: PropertyStage) => mutate({ action: "stage", bagVboId, stage }), [mutate]);

  const setMortgageState = useCallback(async (mortgageState: CalculatorState) => mutate({ action: "mortgage", mortgageState }), [mutate]);

  const setListingPrice = useCallback(async (bagVboId: string, askingPrice: number) => mutate({ action: "listingPrice", bagVboId, askingPrice }), [mutate]);

  const dismissOnboarding = useCallback(async () => mutate({ action: "onboarding", dismissOnboarding: true }), [mutate]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspace,
    workspaceReady,
    workspaceError,
    authStatus,
    authenticated: authStatus === "authenticated",
    toggleSaved,
    toggleCompare,
    setCurrentHome,
    clearCurrentHome,
    saveHistoryItem,
    removeListingHistory,
    setPreferences,
    setBuyerProfile,
    setPropertyStage,
    setMortgageState,
    setListingPrice,
    dismissOnboarding,
    refresh,
  }), [workspace, workspaceReady, workspaceError, authStatus, toggleSaved, toggleCompare, setCurrentHome, clearCurrentHome, saveHistoryItem, removeListingHistory, setPreferences, setBuyerProfile, setPropertyStage, setMortgageState, setListingPrice, dismissOnboarding, refresh]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("usePropertyWorkspace must be used within WorkspaceProvider");
  return context;
}

export { WorkspaceProvider, useWorkspaceContext };
