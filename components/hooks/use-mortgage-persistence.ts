"use client";

import { useEffect, useRef, useState } from "react";
import {
  MORTGAGE_STORAGE_KEY,
  defaultCalculatorState,
  mortgageStateHasCapacity,
  restoreCalculatorState,
  type CalculatorState,
} from "@/src/lib/mortgage";
import { usePropertyWorkspace } from "@/components/use-property-workspace";

export function useMortgagePersistence({
  state,
  applyRestored,
}: {
  state: CalculatorState;
  applyRestored: (restored: CalculatorState) => void;
}) {
  const { workspace, workspaceReady, authenticated, setMortgageState } = usePropertyWorkspace();
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "local" | "login">("idle");
  const migratedLocalRef = useRef(false);
  const accountHydratedRef = useRef(false);

  useEffect(() => {
    if (!workspaceReady || accountHydratedRef.current) return;
    if (authenticated && workspace.mortgageState && mortgageStateHasCapacity(workspace.mortgageState)) {
      accountHydratedRef.current = true;
      applyRestored(restoreCalculatorState(workspace.mortgageState));
      setSaveStatus("saved");
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(MORTGAGE_STORAGE_KEY);
      if (raw) {
        const restored = restoreCalculatorState(JSON.parse(raw), defaultCalculatorState());
        applyRestored(restored);
        if (authenticated && !workspace.mortgageConfigured && mortgageStateHasCapacity(restored) && !migratedLocalRef.current) {
          migratedLocalRef.current = true;
          accountHydratedRef.current = true;
          void setMortgageState(restored).then((result) => {
            if (result.ok) {
              setSaveStatus("saved");
            }
          });
        } else {
          setSaveStatus(authenticated ? "local" : "login");
        }
      } else {
        setSaveStatus(authenticated ? "local" : "login");
      }
    } catch { /* ignore */ }
    accountHydratedRef.current = true;
    setReady(true);
  }, [applyRestored, authenticated, setMortgageState, workspace.mortgageConfigured, workspace.mortgageState, workspaceReady]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(MORTGAGE_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [ready, state]);

  useEffect(() => {
    if (!ready || !authenticated || !mortgageStateHasCapacity(state)) return;
    const handle = window.setTimeout(() => {
      setSaveStatus("saving");
      void setMortgageState(state).then((result) => {
        setSaveStatus(result.ok ? "saved" : authenticated ? "local" : "login");
      });
    }, 900);
    return () => window.clearTimeout(handle);
  }, [authenticated, ready, setMortgageState, state]);

  return { authenticated, ready, saveStatus };
}
