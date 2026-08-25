"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/components/hooks/use-api";
import { checklistForAnalysis, mergeChecklistWithDefaults } from "@/src/lib/checklist";
import {
  checklistSessionNotice,
  loadSessionChecklist,
  saveSessionChecklist,
  supportsSessionChecklistFallback,
} from "@/src/lib/checklist-storage";
import type { Analysis, ChecklistItem } from "@/src/lib/types";

type ChecklistMessages = {
  loginToSaveNotes: string;
  checklistLoadFailed: string;
  checklistSaveFailed: string;
  browserSaveFailed: string;
};

const NOTE_DEBOUNCE_MS = 400;

/**
 * Shared checklist engine: loads the saved checklist (with the documented
 * sessionStorage fallback when the API is unavailable or unauthenticated),
 * persists checkbox changes through a serialized write queue, debounces note
 * typing per item and supports flushing a pending note on blur.
 *
 * Previously duplicated between property-dashboard and viewing-companion with
 * drifting debounce/merge rules; this is the single implementation.
 */
export function useChecklist(bagId: string, analysis: Analysis | null, enabled: boolean, messages: ChecklistMessages) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [error, setError] = useState("");
  const writeQueue = useRef(Promise.resolve());
  const noteTimers = useRef(new Map<string, number>());
  const latestItems = useRef<ChecklistItem[]>([]);

  const persist = useCallback(async (next: ChecklistItem[]) => {
    latestItems.current = next;
    const write = writeQueue.current
      .catch(() => undefined)
      .then(async () => {
        const result = await apiFetch<{ error?: string }>(`/api/checklists/${encodeURIComponent(bagId)}`, {
          method: "POST",
          json: { items: next },
        });
        if (supportsSessionChecklistFallback(result.status)) {
          if (!saveSessionChecklist(bagId, next)) throw new Error(messages.browserSaveFailed);
          setError(result.status === 401 ? messages.loginToSaveNotes : checklistSessionNotice);
          return;
        }
        if (!result.ok) throw new Error(result.error ?? messages.checklistSaveFailed);
        setError("");
      });
    writeQueue.current = write.catch(() => undefined);
    try {
      await write;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : messages.checklistSaveFailed);
    }
  }, [bagId, messages]);

  const persistRef = useRef(persist);
  persistRef.current = persist;

  useEffect(() => {
    if (!analysis || !enabled) return;
    const controller = new AbortController();
    apiFetch<{ items?: ChecklistItem[] | null; error?: string }>(`/api/checklists/${encodeURIComponent(bagId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        const defaults = checklistForAnalysis(analysis);
        if (supportsSessionChecklistFallback(result.status)) {
          const cached = loadSessionChecklist(bagId);
          setChecklist(cached ? mergeChecklistWithDefaults(defaults, cached) : defaults);
          setError(result.status === 401 ? messages.loginToSaveNotes : checklistSessionNotice);
          return;
        }
        if (!result.ok) throw new Error(result.error ?? messages.checklistLoadFailed);
        setChecklist(Array.isArray(result.data?.items) ? mergeChecklistWithDefaults(defaults, result.data.items) : defaults);
        setError("");
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setChecklist(checklistForAnalysis(analysis));
        setError(caught instanceof Error ? caught.message : messages.checklistLoadFailed);
      });
    return () => controller.abort();
  }, [analysis, bagId, enabled, messages]);

  // Flush a pending note on unmount or address switch so the last keystrokes
  // are not lost, then clear the debounce timers.
  useEffect(() => {
    const timers = noteTimers.current;
    return () => {
      if (timers.size > 0) void persistRef.current(latestItems.current);
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, [bagId]);

  /** Persists immediately (checkbox toggles). */
  const save = useCallback((next: ChecklistItem[]) => {
    setChecklist(next);
    void persist(next);
  }, [persist]);

  /** Optimistic update with a per-item debounced persistence for typing. */
  const updateNote = useCallback((itemId: string, note: string) => {
    setChecklist((current) => {
      const next = current.map((candidate) => (candidate.id === itemId ? { ...candidate, note } : candidate));
      latestItems.current = next;
      const existing = noteTimers.current.get(itemId);
      if (existing) window.clearTimeout(existing);
      noteTimers.current.set(itemId, window.setTimeout(() => {
        noteTimers.current.delete(itemId);
        void persist(next);
      }, NOTE_DEBOUNCE_MS));
      return next;
    });
  }, [persist]);

  /** Persists immediately if this item's note is still waiting on its timer. */
  const flushNote = useCallback((itemId: string) => {
    const timer = noteTimers.current.get(itemId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    noteTimers.current.delete(itemId);
    void persistRef.current(latestItems.current.length ? latestItems.current : checklist);
  }, [checklist]);

  return { checklist, error, save, updateNote, flushNote };
}
