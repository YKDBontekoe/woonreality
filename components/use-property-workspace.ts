"use client";

import { useCallback, useEffect, useState } from "react";
import type { PersonalPreferences, Property } from "@/src/lib/types";
import { emptyWorkspace, type WorkspaceData } from "@/src/lib/workspace";
import type { BuyerProfile, PropertyStage } from "@/src/lib/purchase";

export function usePropertyWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => emptyWorkspace());
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceReady, setWorkspaceReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const body = await response.json() as { workspace?: WorkspaceData; error?: string };
      if (response.status === 401) { setWorkspaceError("Log in om je aankoopomgeving te bewaren."); return; }
      if (!response.ok || !body.workspace) throw new Error(body.error ?? "Aankoopomgeving kon niet worden geladen.");
      setWorkspace(body.workspace);
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Aankoopomgeving kon niet worden geladen.");
    } finally {
      setWorkspaceReady(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const mutate = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/workspace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json() as { workspace?: WorkspaceData; error?: string };
    if (response.status === 401) { window.location.href = "/login"; return; }
    if (!response.ok || !body.workspace) throw new Error(body.error ?? "Wijziging kon niet worden opgeslagen.");
    setWorkspace(body.workspace);
    setWorkspaceError("");
  }, []);

  const toggleSaved = useCallback(async (property: Property) => {
    const exists = workspace.saved.some((item) => item.bagVboId === property.bagVboId);
    await mutate(exists ? { action: "unsave", bagVboId: property.bagVboId } : { action: "save", bagVboId: property.bagVboId, addressLabel: property.addressLabel, city: property.city, postcode: property.postcode });
  }, [mutate, workspace.saved]);

  const toggleCompare = useCallback(async (bagVboId: string) => {
    const compare = workspace.compare.includes(bagVboId) ? workspace.compare.filter((id) => id !== bagVboId) : workspace.compare.length >= 4 ? workspace.compare : [...workspace.compare, bagVboId];
    await mutate({ action: "compare", compare });
  }, [mutate, workspace.compare]);

  const setPreferences = useCallback(async (preferences: PersonalPreferences) => mutate({ action: "profile", preferences }), [mutate]);

  const setBuyerProfile = useCallback(async (buyerProfile: BuyerProfile) => mutate({ action: "profile", buyerProfile }), [mutate]);

  const setPropertyStage = useCallback(async (bagVboId: string, stage: PropertyStage) => mutate({ action: "stage", bagVboId, stage }), [mutate]);

  return { workspace, workspaceReady, workspaceError, toggleSaved, toggleCompare, setPreferences, setBuyerProfile, setPropertyStage };
}
