"use client";

import { useCallback, useEffect, useState } from "react";
import type { PersonalPreferences, Property, SavedProperty } from "@/src/lib/types";
import { emptyWorkspace, readWorkspace, writeWorkspace, type WorkspaceData } from "@/src/lib/workspace";

export function usePropertyWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceData>(() => emptyWorkspace());

  useEffect(() => setWorkspace(readWorkspace()), []);
  const toggleSaved = useCallback((property: Property) => {
    setWorkspace((current) => {
      const exists = current.saved.some((item) => item.bagVboId === property.bagVboId);
      const saved: SavedProperty[] = exists
        ? current.saved.filter((item) => item.bagVboId !== property.bagVboId)
        : [{ bagVboId: property.bagVboId, addressLabel: property.addressLabel, city: property.city, postcode: property.postcode, savedAt: new Date().toISOString() }, ...current.saved];
      const next = { ...current, saved };
      writeWorkspace(next);
      return next;
    });
  }, []);

  const toggleCompare = useCallback((bagVboId: string) => {
    setWorkspace((current) => {
      const compare = current.compare.includes(bagVboId)
        ? current.compare.filter((id) => id !== bagVboId)
        : current.compare.length >= 4 ? current.compare : [...current.compare, bagVboId];
      const next = { ...current, compare };
      writeWorkspace(next);
      return next;
    });
  }, []);

  const setPreferences = useCallback((preferences: PersonalPreferences) => {
    setWorkspace((current) => {
      const next = { ...current, preferences, preferencesConfigured: true };
      writeWorkspace(next);
      return next;
    });
  }, []);

  return { workspace, toggleSaved, toggleCompare, setPreferences };
}
