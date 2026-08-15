"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
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
import { useEffect, useRef, useState } from "react";
import { PropertyMap } from "@/components/property-map";
import { SignalCard } from "@/components/signal-card";
import { SiteHeader } from "@/components/site-header";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { StartCaseButton } from "@/components/start-case-button";
import { ValuationBidPanel } from "@/components/valuation-bid-panel";
import {
  calculatePersonalFit,
  DEFAULT_PREFERENCES,
  preferenceLabel,
} from "@/src/lib/personalization";
import {
  checklistForAnalysis,
  mergeChecklistWithDefaults,
} from "@/src/lib/checklist";
import type {
  AiPropertyReport,
  AiReportStatus,
  Analysis,
  ChecklistItem,
  EverydayInsight,
  PersonalPreferences,
  PropertyListing,
} from "@/src/lib/types";

const preferenceKeys = Object.keys(
  DEFAULT_PREFERENCES,
) as (keyof PersonalPreferences)[];

export function PropertyDashboard({ bagId }: { bagId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [listing, setListing] = useState<PropertyListing | null>(null);
  const [listingStatus, setListingStatus] = useState<
    "loading" | "available" | "unavailable"
  >("loading");
  const [aiReport, setAiReport] = useState<AiPropertyReport | null>(null);
  const [aiStatus, setAiStatus] = useState<AiReportStatus>("missing");
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
    setListingStatus("loading");
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
        setListing(value);
        setListingStatus(value ? "available" : "unavailable");
      })
      .catch((caught) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setListingStatus("unavailable");
      });
    return () => controller.abort();
  }, [bagId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/cases", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { cases?: Array<{ id: string; bagVboId?: string | null }> };
        const match = body.cases?.find((item) => item.bagVboId === bagId);
        if (match) setCaseId(match.id);
      })
      .catch(() => undefined);
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
      <main className="site-shell">
        <div className="container">
          <div className="loading-shell">
            <Link className="back-link" href="/">
              <ArrowLeft size={14} /> Terug naar zoeken
            </Link>
            <h1>Dit adres lukt nu niet.</h1>
            <p className="hero-copy">{error}</p>
            <Link className="secondary-button" href="/">
              Nieuw adres zoeken
            </Link>
          </div>
        </div>
      </main>
    );
  if (!analysis) return <LoadingDashboard />;

  const { property } = analysis;
  const generated = new Date(analysis.generatedAt).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const isSaved = workspace.saved.some(
    (item) => item.bagVboId === property.bagVboId,
  );
  const personalFit = calculatePersonalFit(analysis, preferences);
  const highlights = analysis.highlights ?? [];
  const attention = highlights
    .filter((item) => item.type === "attention")
    .slice(0, 3);
  const positives = highlights
    .filter((item) => item.type === "positive")
    .slice(0, 3);
  const nearbyProperties = analysis.nearbyProperties ?? [];

  return (
    <main className="site-shell">
      <div className="container">
        <SiteHeader current="woning" />
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
                onClick={async () => {
                  await toggleSaved(property);
                }}
              >
                {isSaved ? (
                  <Heart size={14} fill="currentColor" />
                ) : (
                  <Heart size={14} />
                )}
                {isSaved ? "Bewaard" : "Bewaar"}
              </button>
              <button
                className={`secondary-button ${workspace.compare.includes(property.bagVboId) ? "selected" : ""}`}
                type="button"
                onClick={async () => {
                  await toggleCompare(property.bagVboId);
                }}
              >
                <GitCompare size={14} />
                {workspace.compare.includes(property.bagVboId) ? "In vergelijking" : "Vergelijk"}
              </button>
              <button
                className="secondary-button share-button"
                type="button"
                onClick={share}
              >
                {copied ? <Check size={14} /> : <Share2 size={14} />}
                {copied ? "Gekopieerd" : "Deel"}
              </button>
            </div>
          </div>
        </header>
        {workspace.compare.length >= 2 && (
          <div className="compare-banner">
            <span>
              <GitCompare size={15} /> {workspace.compare.length} woningen
              geselecteerd om te vergelijken
            </span>
            <Link
              className="primary-button"
              href={`/vergelijken?ids=${workspace.compare.join(",")}`}
            >
              Open vergelijking
            </Link>
          </div>
        )}
        <section className="simple-overview" id="overzicht">
          <SimpleVerdict analysis={analysis} />
          <div id="kaart">
            <PropertyMap
              property={property}
              nearbyProperties={nearbyProperties}
            />
          </div>
        </section>
        <section className="simple-reasons">
          <div className="section-kicker">Waarom dit oordeel?</div>
          <h2>Dit zijn de drie dingen die ertoe doen</h2>
          <EverydayInsights items={analysis.everydayInsights ?? []} />
          <div className="simple-facts">
            <span>
              {property.areaM2
                ? `${property.areaM2} m² BAG-gebruiksoppervlakte`
                : "Oppervlakte onbekend"}
            </span>
            <span>
              {property.buildingYear
                ? `BAG-bouwjaar ${property.buildingYear}`
                : "Bouwjaar onbekend"}
            </span>
            <span>{nearbyProperties.length} woningen dichtbij</span>
          </div>
        </section>
        <PurchaseGuardrails buildingYear={property.buildingYear} />
        <section className="decision-bar" aria-label="Beslis in 30 seconden">
          <div>
            <div className="section-kicker">Wat nu?</div>
            <h2>Bezichtigen, bewaren of laten vallen.</h2>
            <p>De score is screening. De volgende stap is een actie die een makelaar ook zou voorstellen.</p>
          </div>
          <div className="decision-bar-actions">
            <Link className="primary-button" href={`/woning/${property.bagVboId}/bezichtiging`}>Bezichtiging voorbereiden</Link>
            {caseId ? <Link className="secondary-button" href={`/mijn-aankoop/${caseId}`}>Open dossier</Link> : <StartCaseButton bagVboId={property.bagVboId} />}
          </div>
        </section>
        <AiResearchSection report={aiReport} status={aiStatus} />
        {listingStatus !== "unavailable" && (
          <ListingSection listing={listing} status={listingStatus} />
        )}
        <ValuationBidPanel
          bagId={bagId}
          analysis={analysis}
          listing={listing}
          caseId={caseId}
        />
        <section className="case-cta">
          <div>
            <div className="section-kicker">Volgende stap</div>
            <h2>Wil je dit adres serieus meenemen?</h2>
            <p>
              Bewaar je vragen, documenten en deadlines in één persoonlijk
              aankoopdossier.
            </p>
          </div>
          <StartCaseButton bagVboId={property.bagVboId} />
        </section>
        <div className="details-toggle">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails
              ? "Verberg alle data"
              : "Ik wil de volledige check zien"}
            <ChevronDown
              size={14}
              className={showDetails ? "chevron-up" : ""}
            />
          </button>
          <small>
            Voor als je verder wilt vergelijken of je bezichtiging voorbereidt.
          </small>
        </div>
        {showDetails && (
          <div className="full-details">
            <section className="dashboard-grid">
              <div className="score-card">
                <div className="score-card-label">Open-data score</div>
                <div className="score-big">
                  {analysis.overallScore.toLocaleString("nl-NL", {
                    minimumFractionDigits: 1,
                  })}
                  <small>/ 10</small>
                </div>
                <p className="score-tagline">
                  Een omgevingsindicatie op basis van beschikbare bronnen — geen
                  aankoopadvies, taxatie of biedadvies.
                </p>
                <div className="fit-score">
                  <span>Jouw persoonlijke fit</span>
                  <strong>
                    {personalFit == null
                      ? "—"
                      : `${personalFit.toLocaleString("nl-NL", { minimumFractionDigits: 1 })} / 10`}
                  </strong>
                </div>
                <div className="score-footer">
                  <span>
                    <Clock3 size={12} style={{ verticalAlign: "-2px" }} />{" "}
                    bijgewerkt<strong>{generated}</strong>
                  </span>
                  <span>
                    datadekking
                    <strong>{analysis.dataCoverage.label}</strong>
                  </span>
                </div>
              </div>
              <div className="decision-card">
                <div className="section-kicker">Signalen per onderwerp</div>
                <ScoreProfile analysis={analysis} />
              </div>
            </section>
            <section className="insight-grid">
              <InsightList
                title="Hier extra op letten"
                type="attention"
                items={attention}
                analysis={analysis}
              />
              <InsightList
                title="Sterke punten"
                type="positive"
                items={positives}
                analysis={analysis}
              />
            </section>
            <section className="nearby-section" id="omgeving">
              <div className="section-inline-heading">
                <div>
                  <div className="eyebrow">
                    <Database size={13} /> officiële BAG-data
                  </div>
                  <h2>Woningen in de directe omgeving</h2>
                  <p>
                    Een selectie van maximaal 12 geregistreerde woonobjecten
                    binnen 150 meter. Oppervlakte is BAG-gebruiksoppervlakte,
                    geen advertentiemaat.
                  </p>
                </div>
                <span className="coverage-pill">
                  {nearbyProperties.length} adressen
                </span>
              </div>
              {nearbyProperties.length ? (
                <div className="nearby-grid">
                  {nearbyProperties.map((nearby) => (
                    <Link
                      className="nearby-card"
                      href={`/woning/${nearby.bagVboId}`}
                      key={nearby.bagVboId}
                    >
                      <strong>{nearby.addressLabel.split(",")[0]}</strong>
                      <span>
                        {nearby.areaM2
                          ? `${nearby.areaM2} m²`
                          : "oppervlakte onbekend"}{" "}
                        · {nearby.distanceM} m
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p>
                  Voor deze locatie zijn nu geen omliggende woonadressen
                  gevonden.
                </p>
              )}
            </section>
            <section className="preference-panel">
              <div>
                <div className="eyebrow">
                  <Settings2 size={13} /> persoonlijke fit
                </div>
                <p>
                  {workspace.preferencesConfigured
                    ? "Pas aan wat voor jou het zwaarst weegt."
                    : "Stel je voorkeuren in voor een score die bij jouw woonwensen past."}
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowPreferences((value) => !value)}
              >
                {showPreferences ? "Sluiten" : "Voorkeuren instellen"}
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
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      void savePreferences();
                    }}
                  >
                    Bewaar voorkeuren
                  </button>
                </div>
              )}
            </section>
            <div className="signals-heading" id="signalen">
              <h2>De signalen</h2>
              <span>
                {analysis.signals.length} onderdelen · {analysis.sources.length}{" "}
                bronnen
              </span>
            </div>
            <section className="signals-grid">
              {analysis.signals.map((signal) => (
                <SignalCard key={signal.key} signal={signal} />
              ))}
            </section>
            <section className="checklist-section" id="checklist">
              <div className="section-inline-heading">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-dot" /> klaar voor de bezichtiging
                  </div>
                  <h2>Jouw checklist</h2>
                  <p>
                    Concrete vragen uit deze analyse, opgeslagen in je
                    aankoopomgeving.
                  </p>
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
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => window.print()}
                >
                  <Printer size={14} /> Print / bewaar als PDF
                </button>
                </div>
              </div>
              <div className="checklist-list">
                {checklist.map((item) => {
                  const checkboxId = `checklist-${bagId}-${item.id}`;
                  const noteId = `${checkboxId}-note`;
                  return (
                    <div className="checklist-item-wrap" key={item.id}>
                      <label
                        className={`checklist-item ${item.checked ? "checked" : ""}`}
                        htmlFor={checkboxId}
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) => {
                            void saveChecklist(
                              checklist.map((candidate) =>
                                candidate.id === item.id
                                  ? {
                                      ...candidate,
                                      checked: event.target.checked,
                                    }
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
                      <label className="sr-only" htmlFor={noteId}>
                        Notitie voor {item.label}
                      </label>
                      <input
                        id={noteId}
                        className="checklist-note"
                        value={item.note ?? ""}
                        placeholder="Eigen notitie (privé)"
                        onChange={(event) => {
                          void saveChecklist(
                            checklist.map((candidate) =>
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
                <button
                  className="add-checklist"
                  type="button"
                  onClick={() => {
                    void saveChecklist([
                      ...checklist,
                      {
                        id: `custom-${Date.now()}`,
                        label: "Eigen punt",
                        checked: false,
                      },
                    ]);
                  }}
                >
                  + Eigen punt toevoegen
                </button>
              </div>
            </section>
            <section className="sources-section" id="bronnen">
              <div className="section-inline-heading">
                <div>
                  <h2>Bronnen en datadekking</h2>
                  <p>
                    Elke conclusie blijft terug te vinden naar de gebruikte
                    bron. Ontbrekende bronnen leveren geen score op.
                  </p>
                </div>
                <span className="coverage-pill">
                  <Check size={12} /> {analysis.dataCoverage.label}
                </span>
              </div>
              <div className="source-status-list">
                {analysis.sourceStatuses.map((source) => (
                  <div key={source.source}>
                    <span className={`status-dot ${source.status}`} />
                    <strong>{source.source}</strong>
                    <span>
                      {source.status === "ok"
                        ? "beschikbaar"
                        : (source.message ?? "niet beschikbaar")}
                    </span>
                    {source.sourceUrl && (
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open bron
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <div className="source-note">
              <span>
                <strong>Transparantie:</strong> de score is een versieerbare
                omgevingsindicatie, geen oordeel over koopprijs of bouwkundige
                staat.
              </span>
              <span>
                <RefreshCw size={12} style={{ verticalAlign: "-2px" }} />{" "}
                {analysis.analysisVersion}
              </span>
            </div>
            <p className="dashboard-disclaimer">
              WoonReality is een screening- en beslisondersteunend product.
              Model- en open-data-indicaties vervangen geen bouwkundige keuring,
              akoestisch onderzoek, funderingsonderzoek, bodemonderzoek,
              juridisch advies of formele vergunningscheck.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function AiResearchSection({
  report,
  status,
}: {
  report: AiPropertyReport | null;
  status: AiReportStatus;
}) {
  if (status === "unavailable") return null;
  if (!report)
    return (
      <section className="ai-research-section">
        <div className="section-kicker">AI-woningonderzoek</div>
        <h2>
          {status === "failed"
            ? "AI-onderzoek tijdelijk niet beschikbaar"
            : "De woning wordt verder onderzocht…"}
        </h2>
        <p>
          {status === "failed"
            ? "De vaste openbare analyse blijft beschikbaar. Probeer het AI-onderzoek later opnieuw."
            : "We controleren gemeentelijke plannen, officiële bekendmakingen, advertentietekst en relevante omgevingsbronnen."}
        </p>
      </section>
    );
  const attention = report.findings
    .filter((finding) => finding.impact === "attention")
    .slice(0, 4);
  const positive = report.findings
    .filter((finding) => finding.impact === "positive")
    .slice(0, 3);
  return (
    <section className="ai-research-section" id="ai-onderzoek">
      <div className="section-inline-heading">
        <div>
          <div className="section-kicker">AI-woningonderzoek</div>
          <h2>{report.verdict.title}</h2>
          <p>{report.verdict.summary}</p>
        </div>
        <span className="coverage-pill">
          {report.verdict.confidence === "high"
            ? "Hoge zekerheid"
            : report.verdict.confidence === "medium"
              ? "Indicatie"
              : "Beperkte data"}
        </span>
      </div>
      {(attention.length > 0 || positive.length > 0) && (
        <div className="ai-finding-grid">
          {attention.map((finding) => (
            <article className="ai-finding attention" key={finding.id}>
              <strong>{finding.title}</strong>
              <p>{finding.summary}</p>
              <small>
                {finding.spatialScale ?? "omgeving"} · {finding.confidence}
              </small>
            </article>
          ))}
          {positive.map((finding) => (
            <article className="ai-finding positive" key={finding.id}>
              <strong>{finding.title}</strong>
              <p>{finding.summary}</p>
              <small>
                {finding.spatialScale ?? "omgeving"} · {finding.confidence}
              </small>
            </article>
          ))}
        </div>
      )}
      {report.contradictions.length > 0 && (
        <div className="ai-contradictions">
          <strong>Gegevens om te controleren</strong>
          {report.contradictions.map((item) => (
            <p key={item.id}>{item.summary}</p>
          ))}
        </div>
      )}
      <div className="ai-questions">
        <strong>Vragen voor de bezichtiging</strong>
        <ul>
          {report.questions.slice(0, 6).map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </div>
      <details className="ai-sources">
        <summary>
          {report.sources.length} bronnen · rapport geldig tot{" "}
          {new Date(report.expiresAt).toLocaleDateString("nl-NL")}
        </summary>
        {report.sources.map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
            {source.title} · {source.publisher ?? source.url}
          </a>
        ))}
      </details>
    </section>
  );
}

function EverydayInsights({ items }: { items: EverydayInsight[] }) {
  return (
    <div className="everyday-insights">
      {items.map((item) => (
        <article className={`everyday-insight ${item.tone}`} key={item.title}>
          <span className="signal-dot" />
          <div>
            <strong>{item.title}</strong>
            <p>{item.summary}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function PurchaseGuardrails({ buildingYear }: { buildingYear?: number }) {
  const olderBuilding = buildingYear != null && buildingYear < 1945;
  return (
    <section className="purchase-guardrails">
      <div>
        <div className="section-kicker">Voor je een bod doet</div>
        <h2>Dit weet openbare adresdata niet</h2>
        <p>
          Gebruik deze check om vragen te vinden, niet om een maximale koopprijs
          te bepalen.
        </p>
      </div>
      <div className="purchase-guardrail-grid">
        <article>
          <strong>Juridisch & VvE</strong>
          <p>
            Vraag om splitsingsakte, VvE-notulen, begroting, reservefonds, MJOP,
            verzekering en erfpacht- of eigendomstukken.
          </p>
        </article>
        <article>
          <strong>
            {olderBuilding ? "Fundering eerst" : "Bouwkundige staat"}
          </strong>
          <p>
            {olderBuilding
              ? "Bij dit BAG-bouwjaar is fundering een onderzoekspunt. Vraag naar herstel, scheuren, peilmetingen en een onafhankelijk oordeel."
              : "Laat constructie, vocht, installaties, dak en onderhoud onafhankelijk beoordelen."}
          </p>
        </article>
        <article>
          <strong>Prijs & voorwaarden</strong>
          <p>
            Vergelijk pas na actuele referentieverkoop, documentcontrole en
            keuring. Bepaal voorwaarden voor financiering, keuring en oplevering
            apart.
          </p>
        </article>
      </div>
    </section>
  );
}

function SimpleVerdict({ analysis }: { analysis: Analysis }) {
  const attentionCount = (analysis.everydayInsights ?? []).filter(
    (item) => item.tone === "attention",
  ).length;
  const verdict =
    attentionCount >= 2 || analysis.overallScore < 5.5
      ? {
          label: "Bekijk met aandacht",
          detail:
            "Neem bij een bezichtiging extra tijd voor geluid, energie en je dagelijkse route.",
          tone: "attention",
        }
      : attentionCount === 1 || analysis.overallScore < 7
        ? {
            label: "Interessant, met een paar vragen",
            detail:
              "De basis is goed genoeg om te bekijken. Controleer de punten hieronder op locatie.",
            tone: "neutral",
          }
        : {
            label: "Een goede kandidaat om te bekijken",
            detail:
              "De openbare signalen zijn overwegend positief. Check ze vooral met je eigen ogen.",
            tone: "good",
          };
  return (
    <div className={`simple-verdict ${verdict.tone}`}>
      <div className="section-kicker">Eerste indruk</div>
      <h2>{verdict.label}</h2>
      <p>{verdict.detail}</p>
    </div>
  );
}

function formatEuro(value?: number) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("nl-NL", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
}

function formatDate(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function listingStatusLabel(status: PropertyListing["status"]) {
  return {
    active: "Te koop",
    sold: "Verkocht",
    withdrawn: "Ingetrokken",
    unknown: "Status onbekend",
  }[status];
}

function ListingSection({
  listing,
  status,
}: {
  listing: PropertyListing | null;
  status: "loading" | "available" | "unavailable";
}) {
  if (status === "loading")
    return (
      <section className="listing-section">
        <div className="listing-loading">Advertentiedata wordt opgehaald…</div>
      </section>
    );
  if (!listing) return null;

  const facts = [
    [
      "Woonoppervlak",
      listing.livingAreaM2 != null ? `${listing.livingAreaM2} m²` : undefined,
    ],
    [
      "Perceel",
      listing.plotAreaM2 != null ? `${listing.plotAreaM2} m²` : undefined,
    ],
    ["Inhoud", listing.volumeM3 != null ? `${listing.volumeM3} m³` : undefined],
    ["Kamers", listing.roomCount],
    ["Slaapkamers", listing.bedroomCount],
    ["Badkamers", listing.bathroomCount],
    ["Type", listing.propertyType],
    ["Bouwjaar", listing.constructionYear],
    ["Energielabel", listing.energyLabel],
    ["Isolatie", listing.insulation],
    ["Verwarming", listing.heating],
    ["Beglazing", listing.glazing],
    ["Zonnepanelen", listing.solarPanelCount],
    [
      "Buitenruimte",
      listing.outdoorSpaceM2 != null
        ? `${listing.outdoorSpaceM2} m²`
        : undefined,
    ],
    ["Tuinligging", listing.gardenOrientation],
    [
      "Balkon",
      listing.balcony == null ? undefined : listing.balcony ? "Ja" : "Nee",
    ],
    [
      "Terras",
      listing.terrace == null ? undefined : listing.terrace ? "Ja" : "Nee",
    ],
    ["Parkeren", listing.parking],
    ["Berging", listing.storage],
    ["VvE-bijdrage", formatEuro(listing.vveContribution)],
    ["VvE-reserve", formatEuro(listing.vveReserveFund)],
  ].filter(([, value]) => value !== undefined && value !== "—") as [
    string,
    string | number,
  ][];

  return (
    <section className="listing-section" id="advertentie">
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> gelicentieerde marktdata
          </div>
          <h2>Wat de advertentie zegt</h2>
          <p>
            Advertentiegegevens staan los van BAG en openbare registraties.
            Controleer wijzigingen bij de aanbieder.
          </p>
        </div>
        <span className="coverage-pill">
          {listingStatusLabel(listing.status)}
        </span>
      </div>
      <div className="listing-card">
        <div className="listing-price-row">
          <div>
            <span className="listing-label">Vraagprijs</span>
            <strong>{formatEuro(listing.askingPrice)}</strong>
            {listing.pricePerM2 != null && (
              <small>{formatEuro(listing.pricePerM2)} per m²</small>
            )}
          </div>
          <div className="listing-price-history">
            {listing.originalAskingPrice != null && (
              <span>
                Oorspronkelijk {formatEuro(listing.originalAskingPrice)}
              </span>
            )}
            {listing.priceChangeAmount != null && (
              <span>
                Wijziging {formatEuro(listing.priceChangeAmount)}
                {listing.priceChangePct != null
                  ? ` (${listing.priceChangePct.toLocaleString("nl-NL")}%)`
                  : ""}
              </span>
            )}
          </div>
        </div>
        <div className="listing-meta">
          <span>Gepubliceerd {formatDate(listing.firstPublishedAt)}</span>
          <span>Bijgewerkt {formatDate(listing.lastUpdatedAt)}</span>
          {listing.offerDeadline && (
            <span>Bieden tot {formatDate(listing.offerDeadline)}</span>
          )}
        </div>
        {facts.length > 0 && (
          <div className="listing-fact-grid">
            {facts.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="listing-footer">
          <span>
            Bron: {listing.provider} · opgehaald {formatDate(listing.fetchedAt)}
          </span>
          <a href={listing.sourceUrl} target="_blank" rel="noreferrer">
            Open bron
          </a>
        </div>
      </div>
    </section>
  );
}

function ScoreProfile({ analysis }: { analysis: Analysis }) {
  return (
    <div className="score-profile" aria-label="Score per onderwerp">
      {analysis.domains.map((domain) => {
        const score = domain.score ?? 0;
        return (
          <div className="profile-row" key={domain.key}>
            <span>{domain.label}</span>
            <div className="profile-track">
              <i style={{ width: `${Math.round(score * 10)}%` }} />
            </div>
            <strong>
              {domain.score == null
                ? "—"
                : score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

function InsightList({
  title,
  type,
  items,
  analysis,
}: {
  title: string;
  type: "positive" | "attention";
  items: Analysis["highlights"];
  analysis: Analysis;
}) {
  return (
    <div className={`insight-card ${type}`}>
      <h2>{title}</h2>
      {items.map((item) => {
        const signal = analysis.signals.find(
          (candidate) => candidate.key === item.signalKey,
        );
        return (
          <div className="insight-item" key={`${type}-${item.signalKey}`}>
            <span className="signal-dot" />
            <span>
              <strong>{signal?.label}</strong>
              <small>{item.text}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LoadingDashboard() {
  return (
    <main className="site-shell">
      <div className="container loading-shell">
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
    </main>
  );
}
