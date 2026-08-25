"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const TAB_IDS = [
  "overzicht",
  "deal",
  "advertentie",
  "signalen",
  "omgeving",
  "checklist",
  "bronnen",
] as const;

export type TabId = (typeof TAB_IDS)[number];

export const TABS: { id: TabId; hash: string }[] = [
  { id: "overzicht", hash: "#overzicht" },
  { id: "deal", hash: "#deal" },
  { id: "advertentie", hash: "#advertentie" },
  { id: "signalen", hash: "#signalen" },
  { id: "omgeving", hash: "#omgeving" },
  { id: "checklist", hash: "#checklist" },
  { id: "bronnen", hash: "#bronnen" },
];

export const HASH_ALIASES: Record<string, TabId> = {
  kaart: "omgeving",
  "niet-gedekt": "bronnen",
  bodconcept: "deal",
  "ai-onderzoek": "overzicht",
  omschrijving: "advertentie",
};

/**
 * Tab state driven by the URL hash: restores the initial tab from
 * `window.location.hash`, follows hashchange/popstate and pushes history
 * entries on selection. Also tracks which tabs have been opened so lazy
 * panels (AI report, checklist) can defer their fetching, and exposes the
 * button refs needed for roving-tabindex keyboard navigation.
 */
export function useHashTabs<T extends string>(
  tabs: ReadonlyArray<{ id: T; hash: string }>,
  aliases: Record<string, T>,
  defaultTab: T,
) {
  const [tab, setTab] = useState<T>(defaultTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<T>>(() => new Set([defaultTab]));
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const resolveHash = useCallback(
    (hash: string): T => {
      const id = hash.replace(/^#/, "");
      if (tabs.some((entry) => entry.id === id)) return id as T;
      return aliases[id] ?? defaultTab;
    },
    [aliases, defaultTab, tabs],
  );

  const selectTab = useCallback(
    (next: T, updateHistory = true) => {
      setTab(next);
      setVisitedTabs((current) => {
        if (current.has(next)) return current;
        const nextVisited = new Set(current);
        nextVisited.add(next);
        return nextVisited;
      });
      const hash = tabs.find((entry) => entry.id === next)?.hash ?? `#${defaultTab}`;
      if (updateHistory && window.location.hash !== hash) {
        window.history.pushState(null, "", hash);
      }
    },
    [defaultTab, tabs],
  );

  useEffect(() => {
    const initial = resolveHash(window.location.hash);
    setTab(initial);
    setVisitedTabs(new Set([initial]));
    const onLocationChange = () => selectTab(resolveHash(window.location.hash), false);
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, [resolveHash, selectTab]);

  return { tab, visitedTabs, selectTab, tabButtonRefs };
}
