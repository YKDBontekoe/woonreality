"use client";

import {
  ArrowLeft,
  Check,
  GitCompare,
  Heart,
  Home as HomeIcon,
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
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/components/hooks/use-api";
import { useChecklist } from "@/components/hooks/use-checklist";
import { useGeneratedResource } from "@/components/hooks/use-generated-resource";
import { HASH_ALIASES, TABS, TabId, useHashTabs } from "@/components/hooks/use-hash-tabs";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { ValuationBidPanel } from "@/components/valuation-bid-panel";
import { FundaListingPanel } from "@/components/funda-listing-panel";
import { AiResearchSection } from "@/components/ai-research-section";
import { PropertyKpiStrip } from "@/components/property/kpi-strip";
import { PropertyDealPanel } from "@/components/property/deal-panel";
import { ListingKenmerkenGrid } from "@/components/property/kenmerken-grid";
import { ListingDiscrepancyCard } from "@/components/property/listing-discrepancy-card";
import { ListingInsightsPanel } from "@/components/property/listing-insights-panel";
import { PropertyScoreCharts } from "@/components/property/score-charts";
import { SignalExplorer } from "@/components/property/signal-explorer";
import { PropertyActionDock } from "@/components/property/action-dock";
import { RunningCostsPanel } from "@/components/property/running-costs-panel";
import { WozBenchmarkCard } from "@/components/property/woz-benchmark-card";
import { AiDecisionBrief } from "@/components/property/ai-decision-brief";
import { VerdictHero, type TopThing } from "@/components/property/verdict-hero";
import { CompositeCards } from "@/components/property/composite-cards";
import { insightComposites } from "@/src/lib/analysis/composites";
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
import { readListingDraft } from "@/src/lib/listing-draft";
import { listingFromImportedFacts, listingFromUserRecord, type ImportedListingFacts } from "@/src/lib/listing-import";
import { listingNeedsExtension, mergeListings } from "@/src/lib/listing-merge";
import { listingDiscrepancies } from "@/src/lib/listing-compare";
import { hasListingExtractText } from "@/src/lib/listing-text";
import type {
  AiPropertyReport,
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
  const [focusSignalKey, setFocusSignalKey] = useState<string | null>(null);
  const [focusDomain, setFocusDomain] = useState<SignalCategory | null>(null);
  const [mapFocusId, setMapFocusId] = useState<string | null>(null);
  const { authStatus, workspace, toggleSaved, toggleCompare, setCurrentHome, clearCurrentHome, setPreferences } = usePropertyWorkspace();
  const [preferences, setLocalPreferences] =
    useState<PersonalPreferences>(DEFAULT_PREFERENCES);
  const [caseId, setCaseId] = useState<string | null>(null);
  const { tab, visitedTabs, selectTab, tabButtonRefs } = useHashTabs(TABS, HASH_ALIASES, "overzicht" satisfies TabId);

  const [analysisRetry, setAnalysisRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Analysis>(`/api/analysis/${encodeURIComponent(bagId)}?retry=${analysisRetry}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!result.ok || !result.data)
          throw new Error(result.error ?? t("dashboard.analysisLoadFailed"));
        setAnalysis(result.data);
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

  const ai = useGeneratedResource<AiPropertyReport>({
    endpoint: `/api/ai-analysis/${encodeURIComponent(bagId)}`,
    enabled: Boolean(analysis) && visitedTabs.has("overzicht"),
  });

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
        const draft = readListingDraft(bagId);
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

  const checklistState = useChecklist(bagId, analysis, visitedTabs.has("checklist"), {
    loginToSaveNotes: t("viewing.loginToSaveNotes"),
    checklistLoadFailed: t("viewing.checklistLoadFailed"),
    checklistSaveFailed: t("viewing.checklistSaveFailed"),
    browserSaveFailed: t("viewing.browserSaveFailed"),
  });

  const marketListingPreview = mergeListings(userListing, listing);
  const listingExtractKey = marketListingPreview && hasListingExtractText(marketListingPreview)
    ? [
        marketListingPreview.fetchedAt,
        marketListingPreview.description ?? "",
        String(marketListingPreview.askingPrice ?? ""),
        (marketListingPreview.textSections ?? []).map((section) => section.text).join("\n"),
      ].join("\0")
    : "";

  const insights = useGeneratedResource<ListingInsights>({
    endpoint: `/api/listing-insights/${encodeURIComponent(bagId)}`,
    enabled: Boolean(listingExtractKey) && visitedTabs.has("advertentie"),
    resetKey: listingExtractKey,
  });

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

  // Hooks must run before the early returns below.
  const marketListing = useMemo(() => mergeListings(userListing, listing), [userListing, listing]);
  const composites = useMemo(
    () => insightComposites({
      signals: analysis?.signals ?? [],
      buildingYear: analysis?.property.buildingYear,
      askingPrice: marketListing?.askingPrice,
      wozBenchmark: analysis?.wozBenchmark ?? null,
    }),
    [analysis, marketListing],
  );

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
  const isCurrentHome = workspace.currentHome?.bagVboId === property.bagVboId;
  const isCompared = workspace.compare.includes(property.bagVboId);
  const comparisonIsFull = !isCompared && workspace.compare.length >= 4;
  const personalFit = calculatePersonalFit(analysis, preferences);
  const nearbyProperties = analysis.nearbyProperties ?? [];
  const incompleteListing = listingNeedsExtension(marketListing);
  const energyLabel = marketListing?.energyLabel;
  const hypotheekQuery = new URLSearchParams();
  const mortgageEnergyLabel = parseCanonicalEnergyLabel(energyLabel);
  if (mortgageEnergyLabel) hypotheekQuery.set("label", mortgageEnergyLabel);
  if (marketListing?.askingPrice) hypotheekQuery.set("price", String(Math.round(marketListing.askingPrice)));
  const hypotheekHref = (hypotheekQuery.size > 0 ? `/hypotheek?${hypotheekQuery.toString()}` : "/hypotheek") as Route;
  const listingQuestions = (insights.report?.points ?? []).flatMap((point) =>
    point.question ? [listingQuestionItem(point.topic, point.question)] : [],
  );
  const visibleChecklist = mergeChecklistWithDefaults(
    [...checklistForAnalysis(analysis), ...listingQuestions],
    checklistState.checklist.length
      ? checklistState.checklist
      : checklistForAnalysis(analysis),
  );

  function toggleVisibleChecklistItem(item: ChecklistItem, checked: boolean) {
    const stored = checklistState.checklist;
    const next = stored.some((candidate) => candidate.id === item.id)
      ? stored.map((candidate) =>
          candidate.id === item.id ? { ...candidate, checked } : candidate,
        )
      : [...stored, { ...item, checked }];
    checklistState.save(next);
  }

  function setVisibleChecklistNote(item: ChecklistItem, note: string) {
    const stored = checklistState.checklist;
    if (stored.some((candidate) => candidate.id === item.id)) {
      checklistState.updateNote(item.id, note);
      return;
    }
    // Nieuwe advertentievraag: nog niet in de opgeslagen lijst, dus direct
    // toevoegen en wegschrijven (updateNote kan alleen bestaande items muteren).
    checklistState.save([...stored, { ...item, note }]);
  }

  async function saveProperty() {
    setActionNotice("");
    const result = await toggleSaved(property, marketListing?.askingPrice ?? workspace.askingPrices[property.bagVboId]);
    if (!result.ok) {
      setActionNotice(t("dashboard.saveFailedNotice"));
      window.setTimeout(() => setActionNotice(""), 4200);
    }
  }

  async function toggleCurrentHome() {
    setActionNotice("");
    const result = isCurrentHome ? await clearCurrentHome() : await setCurrentHome(property);
    if (result.ok) {
      setActionNotice(isCurrentHome ? t("dashboard.currentHomeCleared") : t("dashboard.currentHomeSet"));
      window.setTimeout(() => setActionNotice(""), 4200);
    } else {
      setActionNotice(t("dashboard.currentHomeFailed"));
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
              className={`ghost-button ${isCurrentHome ? "selected" : ""}`}
              type="button"
              onClick={() => { void toggleCurrentHome(); }}
            >
              <HomeIcon size={14} />
              {isCurrentHome ? t("dashboard.isCurrentHome") : t("dashboard.setCurrentHome")}
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
          <CompositeCards
            stories={composites.stories}
            contradictions={composites.contradictions}
            onJumpToSignal={jumpToSignal}
          />
          <AiDecisionBrief
            analysis={analysis}
            listing={marketListing}
            report={ai.report}
            status={ai.status}
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
              report={ai.report}
              status={ai.status}
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
          {marketListing && (
            <ListingDiscrepancyCard items={listingDiscrepancies(marketListing, analysis)} />
          )}
          {hasListingExtractText(marketListing) && (
            <ListingInsightsPanel insights={insights.report} status={insights.status} />
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
                {checklistState.error && (
                  <p className="form-message" role="status">
                    {checklistState.error}{authStatus === "anonymous" && <> <Link href="/login">{t("logIn")}</Link></>}
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
                          toggleVisibleChecklistItem(item, event.target.checked);
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
                        setVisibleChecklistNote(item, event.target.value);
                      }}
                      onBlur={() => { checklistState.flushNote(item.id); }}
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
