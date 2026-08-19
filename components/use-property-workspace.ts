"use client";

import { useCallback, useEffect, useState } from "react";
import type { ListingHistoryItem } from "@/src/lib/listing-history";
import type { PersonalPreferences, Property } from "@/src/lib/types";
import { emptyWorkspace, type WorkspaceData } from "@/src/lib/workspace";
import type { BuyerProfile, PropertyStage } from "@/src/lib/purchase";
import type { CalculatorState } from "@/src/lib/mortgage/calculator-state";

export type WorkspaceMutationResult = { ok: true } | { ok: false; error: string };
export type WorkspaceAuthStatus = "unknown" | "authenticated" | "anonymous";

const SESSION_COMPARE_KEY = "woonreality.compare";

function sessionCompare(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(SESSION_COMPARE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && /^\d{16}$/.test(id)).slice(0, 4) : [];
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

export function usePropertyWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => emptyWorkspace());
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<WorkspaceAuthStatus>("unknown");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const body = await response.json() as { workspace?: WorkspaceData; error?: string };
      if (response.status === 401) {
        setAuthStatus("anonymous");
        // A comparison is useful before someone creates an account. Keep that
        // lightweight public workflow available, without suggesting the rest
        // of the purchase workspace is stored for this visitor.
        setWorkspace((current) => ({ ...current, compare: sessionCompare() }));
        setWorkspaceError("");
        return;
      }
      if (response.status === 503) {
        setWorkspace((current) => ({ ...current, compare: sessionCompare() }));
        setWorkspaceError("De aankoopomgeving is nu niet beschikbaar. Je kunt de woningcheck wel gewoon gebruiken.");
        return;
      }
      if (!response.ok || !body.workspace) throw new Error(body.error ?? "Aankoopomgeving kon niet worden geladen.");
      setWorkspace(body.workspace);
      setAuthStatus("authenticated");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Aankoopomgeving kon niet worden geladen.");
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (payload: Record<string, unknown>): Promise<WorkspaceMutationResult> => {
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { workspace?: WorkspaceData; error?: string };
      if ((response.status === 401 || response.status === 502 || response.status === 503) && payload.action === "compare" && authStatus !== "authenticated") {
        if (response.status === 401) setAuthStatus("anonymous");
        const compare = Array.isArray(payload.compare)
          ? payload.compare.filter((id): id is string => typeof id === "string" && /^\d{16}$/.test(id)).slice(0, 4)
          : [];
        saveSessionCompare(compare);
        setWorkspace((current) => ({ ...current, compare }));
        setWorkspaceError("Je vergelijking blijft in deze browsersessie bewaard. Log in om die aan je aankoopomgeving te koppelen.");
        return { ok: true };
      }
      if (response.status === 401) {
        setAuthStatus("anonymous");
        window.location.href = "/login";
        return { ok: false, error: "Log in om wijzigingen te bewaren." };
      }
      if (!response.ok || !body.workspace) throw new Error(body.error ?? "Wijziging kon niet worden opgeslagen.");
      setWorkspace(body.workspace);
      setAuthStatus("authenticated");
      setWorkspaceError("");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wijziging kon niet worden opgeslagen.";
      setWorkspaceError(message);
      return { ok: false, error: message };
    }
  }, [authStatus]);

  const toggleSaved = useCallback(async (property: Property, askingPrice?: number | null) => {
    const exists = workspace.saved.some((item) => item.bagVboId === property.bagVboId);
    await mutate(exists
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

  const saveHistoryItem = useCallback(async (item: ListingHistoryItem) => {
    const exists = workspace.saved.some((saved) => saved.bagVboId === item.bagVboId);
    if (exists) return { ok: true } as const;
    return mutate({
      action: "save",
      bagVboId: item.bagVboId,
      addressLabel: item.addressLabel,
      city: item.city || "Onbekend",
      postcode: item.postcode || "onbekend",
      ...(item.askingPrice && item.askingPrice > 0 ? { askingPrice: item.askingPrice } : {}),
    });
  }, [mutate, workspace.saved]);

  const removeListingHistory = useCallback(async (bagVboId: string): Promise<WorkspaceMutationResult> => {
    try {
      const response = await fetch(`/api/listing/user/${encodeURIComponent(bagVboId)}`, { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (response.status === 401) {
        setAuthStatus("anonymous");
        window.location.href = "/login";
        return { ok: false, error: "Log in om wijzigingen te bewaren." };
      }
      if (!response.ok) throw new Error(body.error ?? "Advertentie kon niet uit de geschiedenis worden gehaald.");
      await refresh();
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Advertentie kon niet uit de geschiedenis worden gehaald.";
      setWorkspaceError(message);
      return { ok: false, error: message };
    }
  }, [refresh]);

  const setPreferences = useCallback(async (preferences: PersonalPreferences) => mutate({ action: "profile", preferences }), [mutate]);

  const setBuyerProfile = useCallback(async (buyerProfile: BuyerProfile) => mutate({ action: "profile", buyerProfile }), [mutate]);

  const setPropertyStage = useCallback(async (bagVboId: string, stage: PropertyStage) => mutate({ action: "stage", bagVboId, stage }), [mutate]);

  const setMortgageState = useCallback(async (mortgageState: CalculatorState) => mutate({ action: "mortgage", mortgageState }), [mutate]);

  const setListingPrice = useCallback(async (bagVboId: string, askingPrice: number) => mutate({ action: "listingPrice", bagVboId, askingPrice }), [mutate]);

  const dismissOnboarding = useCallback(async () => mutate({ action: "onboarding", dismissOnboarding: true }), [mutate]);

  return {
    workspace,
    workspaceReady,
    workspaceError,
    authStatus,
    authenticated: authStatus === "authenticated",
    toggleSaved,
    toggleCompare,
    saveHistoryItem,
    removeListingHistory,
    setPreferences,
    setBuyerProfile,
    setPropertyStage,
    setMortgageState,
    setListingPrice,
    dismissOnboarding,
    refresh,
  };
}
