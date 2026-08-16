"use client";

import { useCallback, useEffect, useState } from "react";
import type { PersonalPreferences, Property } from "@/src/lib/types";
import { emptyWorkspace, type WorkspaceData } from "@/src/lib/workspace";
import type { BuyerProfile, PropertyStage } from "@/src/lib/purchase";
import type { CalculatorState } from "@/src/lib/mortgage/calculator-state";

export type WorkspaceMutationResult = { ok: true } | { ok: false; error: string };

export function usePropertyWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => emptyWorkspace());
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const body = await response.json() as { workspace?: WorkspaceData; error?: string };
      if (response.status === 401) {
        setAuthenticated(false);
        setWorkspaceError("Log in om je aankoopomgeving te bewaren.");
        return;
      }
      if (!response.ok || !body.workspace) throw new Error(body.error ?? "Aankoopomgeving kon niet worden geladen.");
      setWorkspace(body.workspace);
      setAuthenticated(true);
      setWorkspaceError("");
    } catch (error) {
      setAuthenticated(false);
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
      if (response.status === 401) { window.location.href = "/login"; return { ok: false, error: "Log in om wijzigingen te bewaren." }; }
      if (!response.ok || !body.workspace) throw new Error(body.error ?? "Wijziging kon niet worden opgeslagen.");
      setWorkspace(body.workspace);
      setAuthenticated(true);
      setWorkspaceError("");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wijziging kon niet worden opgeslagen.";
      setWorkspaceError(message);
      return { ok: false, error: message };
    }
  }, []);

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
    authenticated,
    toggleSaved,
    toggleCompare,
    setPreferences,
    setBuyerProfile,
    setPropertyStage,
    setMortgageState,
    setListingPrice,
    dismissOnboarding,
    refresh,
  };
}
