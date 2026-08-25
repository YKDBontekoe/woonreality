"use client";

import {
  ArrowLeft,
  Check,
  GitCompare,
  Heart,
  MapPinned,
  Printer,
  RefreshCw,
  RotateCcw,
  Share2,
} from "lucide-react";
import { Link } from "@/src/lib/i18n/navigation";
import dynamic from "next/dynamic";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { ValuationBidPanel } from "@/components/valuation-bid-panel";
import { FundaListingPanel } from "@/components/funda-listing-panel";
import { AiResearchSection } from "@/components/ai-research-section";
import { PropertyKpiStrip } from "@/components/property/kpi-strip";
import { PropertyDealPanel } from "@/components/property/deal-panel";
import { ListingKenmerkenGrid } from "@/components/property/kenmerken-grid";
import { ListingInsightsPanel } from "@/components/property/listing-insights-panel";
import { PropertyScoreCharts } from "@/components/property/score-charts";
import { SignalExplorer } from "@/components/property/signal-explorer";
import { PropertyActionDock } from "@/components/property/action-dock";
import { RunningCostsPanel } from "@/components/property/running-costs-panel";
import { WozBenchmarkCard } from "@/components/property/woz-benchmark-card";
import { AiDecisionBrief } from "@/components/property/ai-decision-brief";
import { VerdictHero, type TopThing } from "@/components/property/verdict-hero";
import { PageShell } from "@/components/ui/page-shell";
import {
  calculatePersonalFit,
  DEFAULT_PREFERENCES,
} from "@/src/lib/personalization";
import { parseCanonicalEnergyLabel } from "@/src/lib/mortgage";
import {
  checklistForAnalysis,
  listingQuestionItem,
  mergeChecklistWithDefaults,
} from "@/src/lib/checklist";
import { checklistSessionNotice, loadSessionChecklist, saveSessionChecklist, supportsSessionChecklistFallback } from "@/src/lib/checklist-storage";
import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";
import { listingFromImportedFacts, listingFromUserRecord, type ImportedListingFacts } from "@/src/lib/listing-import";
import { listingNeedsExtension, mergeListings } from "@/src/lib/listing-merge";
import { hasListingExtractText } from "@/src/lib/listing-text";
import type {
  AiPropertyReport,
  AiReportStatus,
  Analysis,
  ChecklistItem,
  ListingInsights,
  PersonalPreferences,
  PropertyListing,
  SignalCategory,
} from "@/src/lib/types";

function MapLoadingFallback() {
  const t = useTranslations("woning");
  return <div className="property-map-loading" role="status">{t("dashboard.mapLoading")}</div>;
}

// Mapbox accounts for most of the property page's JavaScript. Let people read
// the verdict and key figures first; the interactive map follows immediately
// after hydration instead of delaying the whole decision screen.
const PropertyMap = dynamic(
  () => import("@/components/property-map").then((module) => module.PropertyMap),
  {
    ssr: false,
    loading: () => <MapLoadingFallback />,
  },
);

const TAB_IDS = [
  "overzicht",
  "deal",
  "advertentie",
  "signalen",
  "omgeving",
  "checklist",
  "bronnen",
] as const;

type TabId = (typeof TAB_IDS)[number];

const TABS: { id: TabId; hash: string }[] = [
  { id: "overzicht", hash: "#overzicht" },
  { id: "deal", hash: "#deal" },
  { id: "advertentie", hash: "#advertentie" },
  { id: "signalen", hash: "#signalen" },
  { id: "omgeving", hash: "#omgeving" },
  { id: "checklist", hash: "#checklist" },
  { id: "bronnen", hash: "#bronnen" },
];

const HASH_ALIASES: Record<string, TabId> = {
  kaart: "omgeving",
  "niet-gedekt": "bronnen",
  bodconcept: "deal",
  "ai-onderzoek": "overzicht",
  omschrijving: "advertentie",
};

function hashToTab(hash: string): TabId {
  const id = hash.replace(/^#/, "");
  if (TAB_IDS.includes(id as TabId)) return id as TabId;
  return HASH_ALIASES[id] ?? "overzicht";
}

export function PropertyDashboard({ bagId }: { bagId: string }) {
  const t = useTranslations("woning");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareFallback, setShareFallback] = useState(false);
  const [actionNotice, setActionNotice] = useState("");
  const [showPreferences, setShowPreferences] = useState(false);
  const [listing, setListing] = useState<PropertyListing | null>(null);
  const [userListing, setUserListing] = useState<PropertyListing | null>(null);
  const [aiReport, setAiReport] = useState<AiPropertyReport | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReportStatus>("missing");
  const [listingInsights, setListingInsights] = useState<ListingInsights | null>(null);
  const [insightsStatus, setInsightsStatus] = useState<AiReportStatus>("missing");
  const [tab, setTab] = useState<TabId>("overzicht");
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(() => new Set(["overzicht"]));
  const [focusSignalKey, setFocusSignalKey] = useState<string | null>(null);
  const [focusDomain, setFocusDomain] = useState<SignalCategory | null>(null);
  const [mapFocusId, setMapFocusId] = useState<string | null>(null);
  const { authStatus, workspace, toggleSaved, toggleCompare, setPreferences } = usePropertyWorkspace();
  const [preferences, setLocalPreferences] =
    useState<PersonalPreferences>(DEFAULT_PREFERENCES);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistError, setChecklistError] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const checklistWriteQueue = useRef(Promise.resolve());
  const noteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingChecklist = useRef<ChecklistItem[] | null>(null);
  const persistChecklistRef = useRef<(next: ChecklistItem[]) => Promise<void>>(async () => undefined);

  const selectTab = useCallback((next: TabId, updateHistory = true) => {
    setTab(next);
    setVisitedTabs((current) => {
      if (current.has(next)) return current;
      const nextVisited = new Set(current);
      nextVisited.add(next);
      return nextVisited;
    });
    const hash = TABS.find((item) => item.id === next)?.hash ?? "#overzicht";
    if (updateHistory && window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }
  }, []);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const initial = hashToTab(window.location.hash);
    setTab(initial);
    setVisitedTabs(new Set([initial]));
    const onLocationChange = () => selectTab(hashToTab(window.location.hash), false);
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, [selectTab]);

  const [analysisRetry, setAnalysisRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis/${encodeURIComponent(bagId)}?retry=${analysisRetry}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as Analysis & { error?: string };
        if (!response.ok)
          throw new Error(body.error ?? t("dashboard.analysisLoadFailed"));
        setAnalysis(body);
        setError("");
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setError(
            caught instanceof Error ? caught.message : t("somethingWentWrong"),
          );
      });
    return () => controller.abort();
  }, [bagId, analysisRetry, t]);

  useEffect(() => {
    if (!analysis || !visitedTabs.has("overzicht")) return;
    const controller = new AbortController();
    async function loadAiReport() {
      try {
        const statusResponse = await fetch(
          `/api/ai-analysis/${encodeURIComponent(bagId)}`,
          { signal: controller.signal },
        );
        if (statusResponse.status === 503) {
          setAiStatus("unavailable");
          return;
        }
        const statusBody = (await statusResponse.json()) as {
          status: AiReportStatus;
          report?: AiPropertyReport | null;
        };
        setAiStatus(statusBody.status);
        if (statusBody.report) {
          setAiReport(statusBody.report);
          return;
        }
        if (statusBody.status !== "missing" && statusBody.status !== "stale")
          return;
        setAiStatus("generating");
        const generateResponse = await fetch(
          `/api/ai-analysis/${encodeURIComponent(bagId)}`,
          { method: "POST", signal: controller.signal },
        );
        const generateBody = (await generateResponse.json()) as {
          status: AiReportStatus;
          report?: AiPropertyReport | null;
        };
        setAiStatus(generateBody.status);
        if (generateBody.report) setAiReport(generateBody.report);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setAiStatus("failed");
      }
    }
    void loadAiReport();
    return () => controller.abort();
  }, [analysis, bagId, visitedTabs]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/listing/${encodeURIComponent(bagId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          listing?: PropertyListing | null;
        };
        if (response.status === 404 || response.status === 503) return null;
        if (!response.ok)
          throw new Error(t("dashboard.listingLoadFailed"));
        return body.listing ?? null;
      })
      .then((value) => {
        if (!controller.signal.aborted) setListing(value);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setListing(null);
      });
    return () => controller.abort();
  }, [bagId, t]);

  useEffect(() => {
    const controller = new AbortController();
    setUserListing(null);
    async function loadUserListing() {
      try {
        const response = await fetch(`/api/listing/user/${encodeURIComponent(bagId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.ok) {
          const body = await response.json() as {
            listing?: {
              source_url?: string | null;
              asking_price?: number | null;
              extracted_json?: unknown;
              updated_at?: string | null;
            } | null;
          };
          const mapped = body.listing ? listingFromUserRecord(body.listing) : null;
          if (mapped) {
            if (!controller.signal.aborted) setUserListing(mapped);
            return;
          }
        }
        const raw = sessionStorage.getItem(listingStorageKey(bagId));
        const draft = raw ? JSON.parse(raw) as UserListingDraft : null;
        if (!draft) return;
        const facts = {
          notes: [],
          ...(draft.facts as ImportedListingFacts | undefined),
          ...(draft.askingPrice ? { askingPrice: draft.askingPrice } : {}),
        };
        if (draft.sourceUrl || facts.askingPrice || facts.livingAreaM2) {
          if (!controller.signal.aborted) {
            setUserListing(listingFromImportedFacts(draft.sourceUrl || "", facts));
          }
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      }
    }
    void loadUserListing();
    return () => controller.abort();
  }, [bagId]);

  useEffect(() => {
    const controller = new AbortController();
    setCaseId(null);
    fetch("/api/cases", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          setCaseId(null);
          return;
        }
        const body = (await response.json()) as { cases?: Array<{ id: string; bagVboId?: string | null }> };
        const match = body.cases?.find((item) => item.bagVboId === bagId);
        setCaseId(match?.id ?? null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCaseId(null);
      });
    return () => controller.abort();
  }, [bagId]);

  useEffect(() => {
    setLocalPreferences(workspace.preferences);
  }, [workspace.preferences]);

  useEffect(() => {
    if (!analysis || !visitedTabs.has("checklist")) return;
    const controller = new AbortController();
    fetch(`/api/checklists/${encodeURIComponent(bagId)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as {
          items?: ChecklistItem[] | null;
          error?: string;
        };
        if (supportsSessionChecklistFallback(response.status)) {
          const defaults = checklistForAnalysis(analysis);
          const cached = loadSessionChecklist(bagId);
          setChecklist(cached ? mergeChecklistWithDefaults(defaults, cached) : defaults);
          setChecklistError(response.status === 401 ? t("viewing.loginToSaveNotes") : checklistSessionNotice);
          return;
        }
        if (!response.ok)
          throw new Error(body.error ?? t("viewing.checklistLoadFailed"));
        const defaults = checklistForAnalysis(analysis);
        setChecklist(
          Array.isArray(body.items)
            ? mergeChecklistWithDefaults(defaults, body.items)
            : defaults,
        );
        setChecklistError("");
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setChecklist(checklistForAnalysis(analysis));
          setChecklistError(
            caught instanceof Error
              ? caught.message
              : t("viewing.checklistLoadFailed"),
          );
        }
      });
    return () => controller.abort();
  }, [analysis, bagId, visitedTabs, t]);

  const marketListingPreview = mergeListings(userListing, listing);
  const listingExtractKey = marketListingPreview && hasListingExtractText(marketListingPreview)
    ? [
        marketListingPreview.fetchedAt,
        marketListingPreview.description ?? "",
        String(marketListingPreview.askingPrice ?? ""),
        (marketListingPreview.textSections ?? []).map((section) => section.text).join("\n"),
      ].join("\0")
    : "";

  useEffect(() => {
    if (!listingExtractKey || !visitedTabs.has("advertentie")) return;
    setListingInsights(null);
    setInsightsStatus("generating");
    const controller = new AbortController();
    async function loadInsights() {
      try {
        const statusResponse = await fetch(
          `/api/listing-insights/${encodeURIComponent(bagId)}`,
          { signal: controller.signal },
        );
        if (statusResponse.status === 503) {
          setInsightsStatus("unavailable");
          return;
        }
        const statusBody = (await statusResponse.json()) as {
          status: AiReportStatus;
          report?: ListingInsights | null;
        };
        setInsightsStatus(statusBody.status);
        if (statusBody.report) {
          setListingInsights(statusBody.report);
          return;
        }
        if (statusBody.status !== "missing" && statusBody.status !== "stale") return;
        setInsightsStatus("generating");
        const generateResponse = await fetch(
          `/api/listing-insights/${encodeURIComponent(bagId)}`,
          { method: "POST", signal: controller.signal },
        );
        const generateBody = (await generateResponse.json()) as {
          status: AiReportStatus;
          report?: ListingInsights | null;
        };
        setInsightsStatus(generateBody.status);
        if (generateBody.report) setListingInsights(generateBody.report);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setInsightsStatus("failed");
      }
    }
    void loadInsights();
    return () => controller.abort();
  }, [bagId, listingExtractKey, visitedTabs]);

  async function persistChecklist(next: ChecklistItem[]) {
    const write = checklistWriteQueue.current
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch(
          `/api/checklists/${encodeURIComponent(bagId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ items: next }),
          },
        );
        const body = (await response.json()) as { error?: string };
        if (supportsSessionChecklistFallback(response.status)) {
          if (!saveSessionChecklist(bagId, next)) throw new Error(t("viewing.browserSaveFailed"));
          setChecklistError(response.status === 401 ? t("viewing.loginToSaveNotes") : checklistSessionNotice);
          return;
        }
        if (!response.ok)
          throw new Error(
            body.error ?? t("viewing.checklistSaveFailed"),
          );
        setChecklistError("");
      });
    checklistWriteQueue.current = write.catch(() => undefined);
    try {
      await write;
    } catch (caught) {
      setChecklistError(
        caught instanceof Error
          ? caught.message
          : t("viewing.checklistSaveFailed"),
      );
    }
  }

  persistChecklistRef.current = persistChecklist;

  async function saveChecklist(next: ChecklistItem[]) {
    setChecklist(next);
    await persistChecklist(next);
  }

  function queueChecklistNoteSave(next: ChecklistItem[]) {
    setChecklist(next);
    pendingChecklist.current = next;
    if (noteSaveTimer.current) window.clearTimeout(noteSaveTimer.current);
    noteSaveTimer.current = setTimeout(() => {
      const payload = pendingChecklist.current;
      pendingChecklist.current = null;
      noteSaveTimer.current = null;
      if (payload) void persistChecklist(payload);
    }, 400);
  }

  function flushChecklistNoteSave() {
    if (noteSaveTimer.current) {
      window.clearTimeout(noteSaveTimer.current);
      noteSaveTimer.current = null;
    }
    const payload = pendingChecklist.current;
    pendingChecklist.current = null;
    if (payload) void persistChecklist(payload);
  }

  useEffect(() => {
    return () => {
      if (noteSaveTimer.current) window.clearTimeout(noteSaveTimer.current);
      const payload = pendingChecklist.current;
      pendingChecklist.current = null;
      if (payload) void persistChecklistRef.current(payload);
    };
  }, [bagId]);

  async function savePreferences() {
    const result = await setPreferences(preferences);
    if (result.ok) setShowPreferences(false);
  }

  async function share() {
    const url = window.location.href;
    setShareFallback(false);
    try {
      if (navigator.share) {
        await navigator.share({ title: t("dashboard.shareTitle"), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (caught) {
      // Cancelling the native share sheet is intentional. In contexts without
      // either share API, leave the URL selected in a native prompt instead of
      // making the button appear to do nothing.
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setShareFallback(true);
      window.prompt(t("dashboard.copyPrompt"), url);
    }
  }

  if (error)
    return (
      <PageShell current="woning">
        <div className="loading-shell">
          <Link className="back-link" href="/">
            <ArrowLeft size={14} /> {t("backToSearch")}
          </Link>
          <h1>{t("dashboard.addressErrorTitle")}</h1>
          <p className="hero-copy" role="alert">{error}</p>
          <div className="loading-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => { setError(""); setAnalysisRetry((count) => count + 1); }}
            >
              <RotateCcw size={14} /> {t("dashboard.tryAgain")}
            </button>
            <Link className="ghost-button" href="/">
              {t("searchNewAddress")}
            </Link>
          </div>
        </div>
      </PageShell>
    );
  if (!analysis) return <LoadingDashboard />;

  const { property } = analysis;
  const isSaved = workspace.saved.some(
    (item) => item.bagVboId === property.bagVboId,
  );
  const isCompared = workspace.compare.includes(property.bagVboId);
  const comparisonIsFull = !isCompared && workspace.compare.length >= 4;
  const personalFit = calculatePersonalFit(analysis, preferences);
  const nearbyProperties = analysis.nearbyProperties ?? [];
  const marketListing = mergeListings(userListing, listing);
  const incompleteListing = listingNeedsExtension(marketListing);
  const energyLabel = marketListing?.energyLabel;
  const hypotheekQuery = new URLSearchParams();
  const mortgageEnergyLabel = parseCanonicalEnergyLabel(energyLabel);
  if (mortgageEnergyLabel) hypotheekQuery.set("label", mortgageEnergyLabel);
  if (marketListing?.askingPrice) hypotheekQuery.set("price", String(Math.round(marketListing.askingPrice)));
  const hypotheekHref = (hypotheekQuery.size > 0 ? `/hypotheek?${hypotheekQuery.toString()}` : "/hypotheek") as Route;
  const listingQuestions = (listingInsights?.points ?? []).flatMap((point) =>
    point.question ? [listingQuestionItem(point.topic, point.question)] : [],
  );
  const visibleChecklist = mergeChecklistWithDefaults(
    [...checklistForAnalysis(analysis), ...listingQuestions],
    checklist.length ? checklist : checklistForAnalysis(analysis),
  );

  async function saveProperty() {
    setActionNotice("");
    const result = await toggleSaved(property, marketListing?.askingPrice ?? workspace.askingPrices[property.bagVboId]);
    if (!result.ok) {
      setActionNotice(t("dashboard.saveFailedNotice"));
      window.setTimeout(() => setActionNotice(""), 4200);
    }
  }

  function jumpToSignal(thing: TopThing) {
    setFocusSignalKey(thing.signalKeys[0] ?? null);
    setFocusDomain(null);
    selectTab("signalen");
    // Keyboard and screen-reader users need to land where the content changed.
    window.requestAnimationFrame(() => {
      document.getElementById("panel-signalen")?.focus({ preventScroll: false });
    });
  }

  function openDomainSignals(domain: SignalCategory) {
    setFocusDomain(domain);
    setFocusSignalKey(null);
    selectTab("signalen");
    window.requestAnimationFrame(() => {
      document.getElementById("panel-signalen")?.focus({ preventScroll: false });
    });
  }

  return (
    <PageShell current="woning" className="property-dash-shell">
      <header className="dashboard-header">
        <div className="dashboard-top">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" /> {t("dashboard.eyebrow")}
            </div>
            <h1>
              {property.street} {property.houseNumber}
              {property.houseLetter ?? ""}
            </h1>
            <div className="address-meta">
              <MapPinned size={16} /> {property.postcode} {property.city}
            </div>
          </div>
          <div className="dashboard-actions">
            <button
              className={`secondary-button ${isSaved ? "selected" : ""}`}
              type="button"
              onClick={() => { void saveProperty(); }}
            >
              {isSaved ? <Heart size={14} fill="currentColor" /> : <Heart size={14} />}
              {isSaved ? t("saved") : t("save")}
            </button>
            <button
              className={`ghost-button ${isCompared ? "selected" : ""}`}
              type="button"
              disabled={comparisonIsFull}
              title={comparisonIsFull ? t("dashboard.compareFullTitle") : undefined}
              onClick={() => { void toggleCompare(property.bagVboId); }}
            >
              <GitCompare size={14} />
              {isCompared ? t("dashboard.inComparison") : comparisonIsFull ? t("dashboard.comparisonFull") : t("dashboard.compare")}
            </button>
            <button className="ghost-button share-button" type="button" onClick={() => { void share(); }}>
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? t("dashboard.copied") : shareFallback ? t("dashboard.copyLink") : t("dashboard.share")}
            </button>
            {actionNotice ? <span className="dashboard-action-note" role="status">{actionNotice}</span> : null}
          </div>
        </div>
      </header>

      <VerdictHero
        analysis={analysis}
        listing={marketListing}
        personalFit={personalFit}
        preferencesConfigured={workspace.preferencesConfigured}
        showPreferences={showPreferences}
        onTogglePreferences={() => setShowPreferences((value) => !value)}
        preferences={preferences}
        onPreferenceChange={(key, value) =>
          setLocalPreferences({ ...preferences, [key]: value })
        }
        onSavePreferences={() => { void savePreferences(); }}
        onJumpToSignal={jumpToSignal}
      />

      <nav className="dashboard-tabs" role="tablist" aria-label={t("dashboard.sectionsAria")}>
        {TABS.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? "is-on" : ""}
            ref={(node) => {
              tabButtonRefs.current[index] = node;
            }}
            onClick={() => selectTab(item.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const currentIndex = TABS.findIndex((entry) => entry.id === tab);
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? TABS.length - 1
                  : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
              const next = TABS[nextIndex];
              if (!next) return;
              selectTab(next.id);
              tabButtonRefs.current[nextIndex]?.focus();
            }}
          >
            {t(`dashboard.tabs.${item.id}`)}
          </button>
        ))}
      </nav>

      {workspace.compare.length > 0 && (
        <div className="compare-banner" role="status">
          <span>
            <GitCompare size={15} /> {workspace.compare.length === 1
              ? t("dashboard.compareBannerOne")
              : t("dashboard.compareBannerMany", { count: workspace.compare.length })}
          </span>
          <Link
            className="primary-button"
            href={workspace.compare.length >= 2 ? `/vergelijken?ids=${workspace.compare.join(",")}` : "/#zoek-adres"}
          >
            {workspace.compare.length >= 2 ? t("openComparison") : t("dashboard.chooseSecond")}
          </Link>
        </div>
      )}

      {tab === "overzicht" && (
        <div className="dash-tab-panel" role="tabpanel" tabIndex={0} id="panel-overzicht" aria-labelledby="tab-overzicht">
          <div className="dash-hero" id="kaart">
            <PropertyScoreCharts
              analysis={analysis}
              onSelectDomain={openDomainSignals}
              onOpenSignals={() => selectTab("signalen")}
              onOpenSources={() => selectTab("bronnen")}
            />
            <PropertyMap
              property={property}
              nearbyProperties={nearbyProperties}
              signals={analysis.signals}
              gardenOrientationText={marketListing?.gardenOrientation}
              variant="hero"
              onExpand={() => selectTab("omgeving")}
            />
          </div>
          <AiDecisionBrief
            analysis={analysis}
            listing={marketListing}
            report={aiReport}
            status={aiStatus}
            onOpenSignals={() => selectTab("signalen")}
            onOpenChecklist={() => selectTab("checklist")}
          />
          {(analysis.everydayInsights ?? []).length > 0 && (
            <section className="dash-insights-panel">
              <div className="section-kicker">{t("dashboard.dailyLifeKicker")}</div>
              <ul className="dash-point-list">
                {analysis.everydayInsights.map((insight) => (
                  <li
                    className={`is-${insight.tone === "good" ? "positive" : insight.tone === "attention" ? "attention" : "neutral"}`}
                    key={insight.title}
                  >
                    <strong>{insight.title}</strong>
                    <span>{insight.summary}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <RunningCostsPanel
            bagId={bagId}
            vveContribution={marketListing?.vveContribution}
            gasConnection={marketListing?.heating?.toLowerCase().includes("gasloos") ? false : undefined}
            housingType={marketListing?.propertyType}
          />
          <details className="dash-collapsible-panel" id="ai-onderzoek">
            <summary>{t("dashboard.aiResearchSummary")}</summary>
            <AiResearchSection
              report={aiReport}
              status={aiStatus}
              listingIncomplete={incompleteListing}
            />
          </details>
        </div>
      )}

      {tab === "deal" && (
        <div className="dash-tab-panel" role="tabpanel" tabIndex={0} id="panel-deal" aria-labelledby="tab-deal">
          <PropertyKpiStrip analysis={analysis} listing={marketListing} variant="full" />
          <WozBenchmarkCard analysis={analysis} listing={marketListing} />
          <PropertyDealPanel
            listing={marketListing}
            buyerProfile={workspace.buyerProfile}
            mortgageState={workspace.mortgageState}
            mortgageConfigured={workspace.mortgageConfigured}
            hypotheekHref={hypotheekHref}
            energyLabel={mortgageEnergyLabel ?? energyLabel}
            personalFit={personalFit}
          />
          <ValuationBidPanel
            bagId={bagId}
            analysis={analysis}
            listing={marketListing}
            caseId={caseId}
          />
        </div>
      )}

      {tab === "advertentie" && (
        <div className="dash-tab-panel" role="tabpanel" tabIndex={0} id="panel-advertentie" aria-labelledby="tab-advertentie">
          {hasListingExtractText(marketListing) && (
            <ListingInsightsPanel insights={listingInsights} status={insightsStatus} />
          )}
          {!incompleteListing && marketListing ? (
            <ListingKenmerkenGrid listing={marketListing} />
          ) : (
            <FundaListingPanel
              bagId={bagId}
              listing={userListing}
              onListingChange={setUserListing}
            />
          )}
        </div>
      )}

      {tab === "signalen" && (
        <div className="dash-tab-panel" role="tabpanel" tabIndex={0} id="panel-signalen" aria-labelledby="tab-signalen">
          <SignalExplorer
            analysis={analysis}
            focusSignalKey={focusSignalKey}
            domainFilter={focusDomain}
            onDomainFilterChange={setFocusDomain}
          />
        </div>
      )}

      {tab === "omgeving" && (
        <div className="dash-tab-panel" role="tabpanel" tabIndex={0} id="panel-omgeving" aria-labelledby="tab-omgeving">
          <div className="kaart-link-row">
            <Link
              className="secondary-button"
              href={`/kaart?lat=${property.coordinates.lat}&lng=${property.coordinates.lng}&z=12&layer=ses`}
            >
              {t("dashboard.viewOnMap")}
            </Link>
          </div>
          <div className="dash-map-studio" id="kaart">
            <PropertyMap
              property={property}
              nearbyProperties={nearbyProperties}
              signals={analysis.signals}
              gardenOrientationText={marketListing?.gardenOrientation}
              variant="studio"
              focusBagId={mapFocusId}
            />
            <aside className="dash-map-nearby">
              <div className="section-kicker">{t("dashboard.nearbyKicker")}</div>
              <h2>{t("dashboard.nearbyHeading")}</h2>
              {nearbyProperties.length ? (
                <div className="nearby-list">
                  {nearbyProperties.map((nearby) => (
                    <article className={`nearby-card ${mapFocusId === nearby.bagVboId ? "is-on" : ""}`} key={nearby.bagVboId}>
                      <button type="button" className="nearby-card-focus" onClick={() => setMapFocusId(nearby.bagVboId)}>
                        <strong>{nearby.addressLabel.split(",")[0]}</strong>
                        <span>
                          {nearby.areaM2 ? `${nearby.areaM2} m²` : t("dashboard.areaUnknown")} · {nearby.distanceM} m
                        </span>
                      </button>
                      <Link href={`/woning/${nearby.bagVboId}`}>{t("openCheck")}</Link>
                    </article>
                  ))}
                </div>
              ) : (
                <p>{t("dashboard.noNearby")}</p>
              )}
            </aside>
          </div>
        </div>
      )}

      {tab === "checklist" && (
        <div className="dash-tab-panel" role="tabpanel" tabIndex={0} id="panel-checklist" aria-labelledby="tab-checklist">
          <section className="checklist-section" id="checklist">
            <div className="section-inline-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-dot" /> {t("dashboard.checklistEyebrow")}</div>
                <h2>{t("dashboard.viewingTitle")}</h2>
                {checklistError && (
                  <p className="form-message" role="status">
                    {checklistError}{authStatus === "anonymous" && <> <Link href="/login">{t("logIn")}</Link></>}
                  </p>
                )}
              </div>
              <div className="dashboard-actions">
                <Link className="secondary-button" href={`/woning/${bagId}/bezichtiging`}>
                  {t("dashboard.openOnPhone")}
                </Link>
                <button className="secondary-button" type="button" onClick={() => window.print()}>
                  <Printer size={14} /> {t("dashboard.print")}
                </button>
              </div>
            </div>
            <ChecklistProgress checklist={visibleChecklist} />
            <div className="checklist-list">
              {visibleChecklist.map((item) => {
                const checkboxId = `checklist-${bagId}-${item.id}`;
                const noteId = `${checkboxId}-note`;
                return (
                  <div className="checklist-item-wrap" key={item.id}>
                    <label className={`checklist-item ${item.checked ? "checked" : ""}`} htmlFor={checkboxId}>
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={item.checked}
                        onChange={(event) => {
                          void saveChecklist(
                            visibleChecklist.map((candidate) =>
                              candidate.id === item.id
                                ? { ...candidate, checked: event.target.checked }
                                : candidate,
                            ),
                          );
                        }}
                      />
                      <span>
                        <strong>{item.label}</strong>
                        {item.reason && <small>{item.reason}</small>}
                      </span>
                    </label>
                    <label className="sr-only" htmlFor={noteId}>{t("dashboard.noteAria", { label: item.label })}</label>
                    <input
                      id={noteId}
                      className="checklist-note"
                      value={item.note ?? ""}
                      placeholder={t("dashboard.notePlaceholder")}
                      onChange={(event) => {
                        queueChecklistNoteSave(
                          visibleChecklist.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, note: event.target.value }
                              : candidate,
                          ),
                        );
                      }}
                      onBlur={() => { flushChecklistNoteSave(); }}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {tab === "bronnen" && (
        <div className="dash-tab-panel" role="tabpanel" tabIndex={0} id="panel-bronnen" aria-labelledby="tab-bronnen">
          <div className="purchase-guardrail-grid dash-guardrails">
            <article>
              <strong>{t("dashboard.legal")}</strong>
              <p>{t("dashboard.legalBody")}</p>
            </article>
            <article>
              <strong>{property.buildingYear != null && property.buildingYear < 1945 ? t("dashboard.foundation") : t("dashboard.structural")}</strong>
              <p>{t("dashboard.structuralBody")}</p>
            </article>
            <article>
              <strong>{t("dashboard.price")}</strong>
              <p>{t("dashboard.priceBody")}</p>
            </article>
          </div>
          <section className="sources-section" id="bronnen">
            <div className="section-inline-heading">
              <div>
                <h2>{t("dashboard.sourcesTitle")}</h2>
              </div>
              <span className="coverage-pill"><Check size={12} /> {analysis.dataCoverage.label}</span>
            </div>
            <SourceStatusSummary statuses={analysis.sourceStatuses.map((source) => source.status)} />
            <div className="source-status-list">
              {analysis.sourceStatuses.map((source) => (
                <div key={source.source}>
                  <span className={`status-dot ${source.status}`} />
                  <strong>{source.source}</strong>
                  <span>{source.status === "ok" ? t("dashboard.statusAvailable") : (source.message ?? t("dashboard.statusUnavailable"))}</span>
                </div>
              ))}
            </div>
          </section>
          {analysis.knownGaps.length > 0 && (
            <section className="known-gaps-section" id="niet-gedekt">
              <h2>{t("dashboard.notCovered")}</h2>
              <div className="known-gaps-list">
                {analysis.knownGaps.map((gap) => (
                  <div key={gap.key} className="known-gap">
                    <strong>{gap.label}</strong>
                    <p>{gap.summary}</p>
                    <a href={gap.checkUrl} target="_blank" rel="noreferrer">{gap.checkLabel}</a>
                  </div>
                ))}
              </div>
            </section>
          )}
          <div className="source-note">
            <span><strong>{t("dashboard.scoreNoteStrong")}</strong> {t("dashboard.scoreNoteRest")}</span>
            <span><RefreshCw size={12} /> {analysis.analysisVersion}</span>
          </div>
          <p className="dashboard-disclaimer">
            {t("dashboard.disclaimer")}
          </p>
        </div>
      )}

      <PropertyActionDock
        bagVboId={property.bagVboId}
        hypotheekHref={hypotheekHref}
        caseId={caseId}
        isSaved={isSaved}
        onSave={() => { void saveProperty(); }}
      />
    </PageShell>
  );
}

function LoadingBackLabel() {
  const t = useTranslations("woning");
  return <>{t("backToSearch")}</>;
}

function SourceStatusSummary({ statuses }: { statuses: ("ok" | "partial" | "unavailable")[] }) {
  const t = useTranslations("woning");
  if (!statuses.length) return null;
  const counts = {
    ok: statuses.filter((status) => status === "ok").length,
    partial: statuses.filter((status) => status === "partial").length,
    unavailable: statuses.filter((status) => status === "unavailable").length,
  };
  return (
    <div
      className="source-summary"
      role="img"
      aria-label={t("dashboard.sourcesSummaryAria", counts)}
    >
      <div className="coverage-strip-bar source-summary-bar">
        {statuses.map((status, index) => (
          <i className={status} key={`${status}-${index}`} />
        ))}
      </div>
      <ul className="source-summary-legend">
        {counts.ok > 0 && <li><i className="ok" aria-hidden="true" /> {counts.ok} {t("dashboard.statusAvailable")}</li>}
        {counts.partial > 0 && <li><i className="partial" aria-hidden="true" /> {counts.partial} {t("dashboard.statusPartial")}</li>}
        {counts.unavailable > 0 && <li><i className="unavailable" aria-hidden="true" /> {counts.unavailable} {t("dashboard.statusUnavailable")}</li>}
      </ul>
    </div>
  );
}

function ChecklistProgress({ checklist }: { checklist: ChecklistItem[] }) {  const t = useTranslations("woning");
  if (!checklist.length) return null;
  const done = checklist.filter((item) => item.checked).length;
  const pct = Math.round((done / checklist.length) * 100);
  return (
    <div className="checklist-progress">
      <div
        className="checklist-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={checklist.length}
        aria-valuenow={done}
        aria-label={t("dashboard.checklistProgressAria", { done, total: checklist.length })}
      >
        <i style={{ width: `${pct}%` }} />
      </div>
      <small>{t("dashboard.checklistProgress", { done, total: checklist.length })}</small>
    </div>
  );
}

function LoadingDashboard() {
  return (
    <PageShell current="woning" className="property-dash-shell">
      <div className="loading-shell">
        <Link className="back-link" href="/">
          <ArrowLeft size={14} /> <LoadingBackLabel />
        </Link>
        <div className="loading-block" />
        <div className="loading-block big" />
        <div className="loading-grid">
          <div className="loading-panel" />
          <div className="loading-panel" />
        </div>
      </div>
    </PageShell>
  );
}
