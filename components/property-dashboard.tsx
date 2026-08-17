"use client";

import {
  ArrowLeft,
  Check,
  Database,
  GitCompare,
  Heart,
  MapPinned,
  Printer,
  RefreshCw,
  Settings2,
  Share2,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { PropertyMap } from "@/components/property-map";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { ValuationBidPanel } from "@/components/valuation-bid-panel";
import { FundaListingPanel } from "@/components/funda-listing-panel";
import { AiResearchSection } from "@/components/ai-research-section";
import { PropertyKpiStrip } from "@/components/property/kpi-strip";
import { PropertyDealPanel } from "@/components/property/deal-panel";
import { ListingKenmerkenGrid } from "@/components/property/kenmerken-grid";
import { ListingInsightsPanel } from "@/components/property/listing-insights-panel";
import { PropertyScoreCharts } from "@/components/property/score-charts";
import { SignalGauges } from "@/components/property/signal-gauges";
import { PropertyActionDock } from "@/components/property/action-dock";
import { PageShell } from "@/components/ui/page-shell";
import {
  calculatePersonalFit,
  DEFAULT_PREFERENCES,
  preferenceLabel,
} from "@/src/lib/personalization";
import { parseCanonicalEnergyLabel } from "@/src/lib/mortgage";
import {
  checklistForAnalysis,
  mergeChecklistWithDefaults,
} from "@/src/lib/checklist";
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
} from "@/src/lib/types";

const preferenceKeys = Object.keys(
  DEFAULT_PREFERENCES,
) as (keyof PersonalPreferences)[];

const TABS = [
  { href: "#overzicht", label: "Overzicht" },
  { href: "#deal", label: "Jouw deal" },
  { href: "#advertentie", label: "Advertentie" },
  { href: "#signalen", label: "Signalen" },
  { href: "#omgeving", label: "Omgeving" },
  { href: "#checklist", label: "Checklist" },
  { href: "#bronnen", label: "Bronnen" },
];

export function PropertyDashboard({ bagId }: { bagId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [listing, setListing] = useState<PropertyListing | null>(null);
  const [userListing, setUserListing] = useState<PropertyListing | null>(null);
  const [aiReport, setAiReport] = useState<AiPropertyReport | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReportStatus>("missing");
  const [listingInsights, setListingInsights] = useState<ListingInsights | null>(null);
  const [insightsStatus, setInsightsStatus] = useState<AiReportStatus>("missing");
  const { workspace, toggleSaved, toggleCompare, setPreferences } = usePropertyWorkspace();
  const [preferences, setLocalPreferences] =
    useState<PersonalPreferences>(DEFAULT_PREFERENCES);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistError, setChecklistError] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const checklistWriteQueue = useRef(Promise.resolve());

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis/${encodeURIComponent(bagId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as Analysis & { error?: string };
        if (!response.ok)
          throw new Error(body.error ?? "De analyse kon niet worden geladen");
        setAnalysis(body);
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setError(
            caught instanceof Error ? caught.message : "Er ging iets mis",
          );
      });
    return () => controller.abort();
  }, [bagId]);

  useEffect(() => {
    if (!analysis) return;
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
  }, [analysis, bagId]);

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
          throw new Error("Advertentiedata kon niet worden geladen");
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
  }, [bagId]);

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
    if (!analysis) return;
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
        if (response.status === 401) {
          setChecklist(checklistForAnalysis(analysis));
          setChecklistError("Log in om je checklist te bewaren.");
          return;
        }
        if (!response.ok)
          throw new Error(body.error ?? "Checklist kon niet worden geladen.");
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
              : "Checklist kon niet worden geladen.",
          );
        }
      });
    return () => controller.abort();
  }, [analysis, bagId]);

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
    if (!listingExtractKey) {
      setInsightsStatus("missing");
      setListingInsights(null);
      return;
    }
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
  }, [bagId, listingExtractKey]);

  async function saveChecklist(next: ChecklistItem[]) {
    setChecklist(next);
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
        if (!response.ok)
          throw new Error(
            body.error ?? "Checklist kon niet worden opgeslagen.",
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
          : "Checklist kon niet worden opgeslagen.",
      );
    }
  }

  async function savePreferences() {
    const result = await setPreferences(preferences);
    if (result.ok) setShowPreferences(false);
  }

  async function share() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard may be unavailable in private contexts. */
    }
  }

  if (error)
    return (
      <PageShell current="woning">
        <div className="loading-shell">
          <Link className="back-link" href="/">
            <ArrowLeft size={14} /> Terug naar zoeken
          </Link>
          <h1>Dit adres lukt nu niet.</h1>
          <p className="hero-copy">{error}</p>
          <Link className="primary-button" href="/">
            Nieuw adres zoeken
          </Link>
        </div>
      </PageShell>
    );
  if (!analysis) return <LoadingDashboard />;

  const { property } = analysis;
  const isSaved = workspace.saved.some(
    (item) => item.bagVboId === property.bagVboId,
  );
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
  const listingQuestions: ChecklistItem[] = (listingInsights?.points ?? []).flatMap((point, index) =>
    point.question
      ? [{
          id: `listing-q-${index}`,
          label: point.question,
          reason: point.topic,
          checked: false,
        }]
      : [],
  );
  const visibleChecklist = mergeChecklistWithDefaults(
    [...checklistForAnalysis(analysis), ...listingQuestions],
    checklist,
  );

  async function saveProperty() {
    await toggleSaved(property, marketListing?.askingPrice ?? workspace.askingPrices[property.bagVboId]);
  }

  return (
    <PageShell current="woning" className="property-dash-shell">
      <header className="dashboard-header">
        <Link className="back-link" href="/">
          <ArrowLeft size={14} /> Ander adres
        </Link>
        <div className="dashboard-top">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" /> woningcheck
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
              {isSaved ? "Bewaard" : "Bewaar"}
            </button>
            <button
              className={`ghost-button ${workspace.compare.includes(property.bagVboId) ? "selected" : ""}`}
              type="button"
              onClick={() => { void toggleCompare(property.bagVboId); }}
            >
              <GitCompare size={14} />
              {workspace.compare.includes(property.bagVboId) ? "In vergelijking" : "Vergelijk"}
            </button>
            <button className="ghost-button share-button" type="button" onClick={() => { void share(); }}>
              {copied ? <Check size={14} /> : <Share2 size={14} />}
              {copied ? "Gekopieerd" : "Deel"}
            </button>
          </div>
        </div>
      </header>
      <nav className="dashboard-tabs" aria-label="Dashboardsecties">
        {TABS.map((tab) => (
          <a href={tab.href} key={tab.href}>{tab.label}</a>
        ))}
      </nav>
      {workspace.compare.length >= 2 && (
        <div className="compare-banner">
          <span>
            <GitCompare size={15} /> {workspace.compare.length} woningen geselecteerd om te vergelijken
          </span>
          <Link className="primary-button" href={`/vergelijken?ids=${workspace.compare.join(",")}`}>
            Open vergelijking
          </Link>
        </div>
      )}
      <PropertyKpiStrip analysis={analysis} listing={marketListing} />
      <PropertyDealPanel
        listing={marketListing}
        buyerProfile={workspace.buyerProfile}
        mortgageState={workspace.mortgageState}
        mortgageConfigured={workspace.mortgageConfigured}
        hypotheekHref={hypotheekHref}
        energyLabel={mortgageEnergyLabel ?? energyLabel}
        personalFit={personalFit}
      />
      <div className="dash-hero">
        <PropertyScoreCharts analysis={analysis} />
        <div id="kaart">
          <PropertyMap property={property} nearbyProperties={nearbyProperties} />
        </div>
      </div>
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
      <SignalGauges signals={analysis.signals} />
      <section className="nearby-section" id="omgeving">
        <div className="section-inline-heading">
          <div>
            <div className="eyebrow"><Database size={13} /> omgeving</div>
            <h2>Woningen dichtbij</h2>
          </div>
          <span className="coverage-pill">{nearbyProperties.length}</span>
        </div>
        {nearbyProperties.length ? (
          <div className="nearby-grid">
            {nearbyProperties.map((nearby) => (
              <Link className="nearby-card" href={`/woning/${nearby.bagVboId}`} key={nearby.bagVboId}>
                <strong>{nearby.addressLabel.split(",")[0]}</strong>
                <span>
                  {nearby.areaM2 ? `${nearby.areaM2} m²` : "oppervlakte onbekend"} · {nearby.distanceM} m
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p>Geen omliggende woonadressen gevonden.</p>
        )}
      </section>
      <section className="preference-panel">
        <div>
          <div className="eyebrow"><Settings2 size={13} /> persoonlijke fit</div>
          <p>{workspace.preferencesConfigured ? "Pas aan wat voor jou telt." : "Stel je voorkeuren in."}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setShowPreferences((value) => !value)}>
          {showPreferences ? "Sluiten" : "Voorkeuren"}
        </button>
        {showPreferences && (
          <div className="preference-controls">
            {preferenceKeys.map((key) => {
              const inputId = `preference-${key}`;
              return (
                <div className="preference-control" key={key}>
                  <label htmlFor={inputId}>{preferenceLabel(key)}</label>
                  <input
                    id={inputId}
                    type="range"
                    min="1"
                    max="5"
                    value={preferences[key]}
                    onChange={(event) =>
                      setLocalPreferences({
                        ...preferences,
                        [key]: Number(event.target.value),
                      })
                    }
                  />
                  <output htmlFor={inputId}>{preferences[key]}</output>
                </div>
              );
            })}
            <button className="primary-button" type="button" onClick={() => { void savePreferences(); }}>
              Bewaar voorkeuren
            </button>
          </div>
        )}
      </section>
      <AiResearchSection
        report={aiReport}
        status={aiStatus}
        listingIncomplete={incompleteListing}
      />
      <ValuationBidPanel
        bagId={bagId}
        analysis={analysis}
        listing={marketListing}
        caseId={caseId}
      />
      <section className="checklist-section" id="checklist">
        <div className="section-inline-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> checklist</div>
            <h2>Bezichtiging</h2>
            {checklistError && (
              <p className="form-message" role="status">
                {checklistError} <Link href="/login">Inloggen</Link>
              </p>
            )}
          </div>
          <div className="dashboard-actions">
            <Link className="secondary-button" href={`/woning/${bagId}/bezichtiging`}>
              Open op je telefoon
            </Link>
            <button className="secondary-button" type="button" onClick={() => window.print()}>
              <Printer size={14} /> Print
            </button>
          </div>
        </div>
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
                <label className="sr-only" htmlFor={noteId}>Notitie voor {item.label}</label>
                <input
                  id={noteId}
                  className="checklist-note"
                  value={item.note ?? ""}
                  placeholder="Eigen notitie"
                  onChange={(event) => {
                    void saveChecklist(
                      visibleChecklist.map((candidate) =>
                        candidate.id === item.id
                          ? { ...candidate, note: event.target.value }
                          : candidate,
                      ),
                    );
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>
      <div className="purchase-guardrail-grid dash-guardrails">
        <article>
          <strong>Juridisch</strong>
          <p>VvE, erfpacht, splitsing — zelf opvragen.</p>
        </article>
        <article>
          <strong>{property.buildingYear != null && property.buildingYear < 1945 ? "Fundering" : "Bouwkundig"}</strong>
          <p>Keuring blijft nodig. Open data ziet de constructie niet.</p>
        </article>
        <article>
          <strong>Prijs</strong>
          <p>Bod pas na documenten en keuring.</p>
        </article>
      </div>
      <section className="sources-section" id="bronnen">
        <div className="section-inline-heading">
          <div>
            <h2>Bronnen</h2>
          </div>
          <span className="coverage-pill"><Check size={12} /> {analysis.dataCoverage.label}</span>
        </div>
        <div className="source-status-list">
          {analysis.sourceStatuses.map((source) => (
            <div key={source.source}>
              <span className={`status-dot ${source.status}`} />
              <strong>{source.source}</strong>
              <span>{source.status === "ok" ? "beschikbaar" : (source.message ?? "niet beschikbaar")}</span>
            </div>
          ))}
        </div>
      </section>
      {analysis.knownGaps.length > 0 && (
        <section className="known-gaps-section" id="niet-gedekt">
          <h2>Niet gedekt</h2>
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
        <span><strong>Score</strong> is een omgevingsindicatie, geen koopadvies.</span>
        <span><RefreshCw size={12} /> {analysis.analysisVersion}</span>
      </div>
      <p className="dashboard-disclaimer">
        Open data vervangt geen keuring, notaris of hypotheekadvies.
      </p>
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

function LoadingDashboard() {
  return (
    <PageShell current="woning" className="property-dash-shell">
      <div className="loading-shell">
        <Link className="back-link" href="/">
          <ArrowLeft size={14} /> Terug naar zoeken
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
