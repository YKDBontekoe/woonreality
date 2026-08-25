"use client";

import { ArrowLeft, GitCompare, Heart, Link2, Check, House, X } from "lucide-react";
import { Link, usePathname } from "@/src/lib/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { CompareEmptyState, removeIdsFromUrl, useShareUrl } from "@/components/comparison-shell";
import { PageShell } from "@/components/ui/page-shell";
import { ComparisonSkeleton } from "@/components/ui/route-skeletons";
import { comparisonListingFromUserRow, comparisonListingFromSessionDraft, type ComparisonListingFacts } from "@/src/lib/listing-history";
import { apiFetch } from "@/components/hooks/use-api";
import { calculatePersonalFit } from "@/src/lib/personalization";
import { normalizeLocale } from "@/src/lib/i18n/config";
import { scoreDelta } from "@/src/lib/current-home";
import type { Analysis } from "@/src/lib/types";
import { formatScore } from "@/src/lib/math";
import { formatEuro } from "@/src/lib/purchase";

type ComparisonListing = ComparisonListingFacts;
const EMPTY_LISTING: ComparisonListingFacts = {
  askingPrice: null,
  livingAreaM2: null,
  roomCount: null,
  bedroomCount: null,
  energyLabel: null,
  vveContribution: null,
};

async function fetchAnalysis(bagVboId: string, signal: AbortSignal): Promise<Analysis | null> {
  try {
    const result = await apiFetch<Analysis>(`/api/analysis/${encodeURIComponent(bagVboId)}`, { signal, cache: "no-store" });
    return result.ok ? result.data ?? null : null;
  } catch {
    return null;
  }
}

export function ComparisonDashboard({ bagIds, invalidCount = 0 }: { bagIds: string[]; invalidCount?: number }) {
  const t = useTranslations("vergelijken");
  const locale = normalizeLocale(useLocale());
  const pathname = usePathname();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [baseline, setBaseline] = useState<Analysis | null>(null);
  const [listings, setListings] = useState<Record<string, ComparisonListing>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { workspace, workspaceReady, authStatus, toggleCompare } = usePropertyWorkspace();
  const selectedBagIdsKey = (bagIds.length > 0 ? bagIds : workspace.compare).join(",");
  // De huidige woning is de vaste referentiekolom; hij telt niet mee voor het
  // maximum van vier kandidaten en staat nooit in de ?ids= link.
  const currentHomeId = workspace.currentHome?.bagVboId ?? null;
  const baselineNeeded = Boolean(currentHomeId && !selectedBagIdsKey.split(",").includes(currentHomeId));
  const baselineIdKey = baselineNeeded ? currentHomeId : "";

  const { copied, share } = useShareUrl(() => {
    const ids = analyses.map((analysis) => analysis.property.bagVboId).join(",");
    return `${window.location.origin}/${locale}${pathname}?ids=${ids}`;
  }, t("copyPrompt"));

  useEffect(() => {
    // A global navigation to /vergelijken has no query string. Wait for the
    // workspace so an account or browser-session comparison can be restored.
    if (bagIds.length === 0 && !workspaceReady) return;
    const selectedBagIds = selectedBagIdsKey ? selectedBagIdsKey.split(",") : [];
    let active = true;
    const controller = new AbortController();
    // A property analysis can include several live government sources. Twelve seconds
    // occasionally cancels a valid second result just as it is returned.
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    async function loadAnalyses() {
      setLoading(true);
      setLoadError("");
      if (selectedBagIds.length < 2 && !baselineIdKey) {
        setAnalyses([]);
        setBaseline(null);
        setLoading(false);
        window.clearTimeout(timeout);
        return;
      }
      try {
        const items = await Promise.all(selectedBagIds.map(async (id) => fetchAnalysis(id, controller.signal)));
        const available = items.filter((item): item is Analysis => Boolean(item));
        if (active) {
          setAnalyses(available);
          if (available.length !== items.length) setLoadError(t("errorPartial"));
        }
        // De baseline komt uit een eigen fetch of, als de huidige woning al
        // tussen de kandidaten staat, uit diezelfde resultaten.
        const baselineAnalysis = baselineIdKey
          ? await fetchAnalysis(baselineIdKey, controller.signal)
          : currentHomeId
            ? available.find((item) => item.property.bagVboId === currentHomeId) ?? null
            : null;
        if (active) {
          setBaseline(baselineAnalysis);
          if (baselineIdKey && !baselineAnalysis) setLoadError(t("currentHomeUnavailable"));
        }
        // Vraagprijzen zijn optioneel (login vereist voor bewaarde advertentiegegevens);
        // ontbrekende data mag de vergelijking zelf niet blokkeren.
        const listingIds = [...available.map((analysis) => analysis.property.bagVboId), ...(baselineIdKey ? [baselineIdKey] : [])];
        const listingEntries = await Promise.all(listingIds.map(async (id) => {
          try {
            const result = await apiFetch<{ listing?: { asking_price: number | null; extracted_json?: unknown } | null }>(`/api/listing/user/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" });
            if (!result.ok || !result.data) {
              // Anonymous visitors keep their Funda facts in a session draft;
              // show that instead of "Onbekend".
              return [id, comparisonListingFromSessionDraft(id) ?? EMPTY_LISTING] as const;
            }
            return [id, comparisonListingFromUserRow(result.data.listing)] as const;
          } catch {
            return [id, comparisonListingFromSessionDraft(id) ?? EMPTY_LISTING] as const;
          }
        }));
        if (active) setListings(Object.fromEntries(listingEntries));
      } catch {
        if (active) setLoadError(t("errorLoadFailed"));
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    void loadAnalyses();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [bagIds.length, selectedBagIdsKey, baselineIdKey, currentHomeId, workspaceReady, t]);

  if (loading) return <ComparisonSkeleton />;
  const columns: Analysis[] = baseline && !analyses.some((analysis) => analysis.property.bagVboId === baseline.property.bagVboId)
    ? [baseline, ...analyses]
    : analyses;
  if (columns.length < 2 || !analyses[0]) {
    return (
      <CompareEmptyState
        titleId="comparison-empty-title"
        backLabel={t("backSearch")}
        eyebrow={t("eyebrow")}
        title={t("emptyTitle")}
        copy={t("emptyCopy")}
        steps={[
          { title: t("step1Title"), text: t("step1Text") },
          { title: t("step2Title"), text: t("step2Text") },
          { title: t("step3Title"), text: t("step3Text") },
        ]}
        ctaLabel={t("emptyCta")}
        alert={loadError ? { text: loadError, role: "alert" } : undefined}
      />
    );
  }

  const domains = analyses[0].domains;
  const isBaseline = (analysis: Analysis) => baseline?.property.bagVboId === analysis.property.bagVboId;
  const listingFor = (analysis: Analysis) => {
    const fetched = listings[analysis.property.bagVboId];
    const history = workspace.listingHistory.find((item) => item.bagVboId === analysis.property.bagVboId);
    return {
      askingPrice: fetched?.askingPrice ?? history?.askingPrice ?? null,
      livingAreaM2: fetched?.livingAreaM2 ?? history?.livingAreaM2 ?? null,
      roomCount: fetched?.roomCount ?? history?.roomCount ?? null,
      bedroomCount: fetched?.bedroomCount ?? history?.bedroomCount ?? null,
      energyLabel: fetched?.energyLabel ?? history?.energyLabel ?? null,
      vveContribution: fetched?.vveContribution ?? history?.vveContribution ?? null,
    };
  };
  const askingPriceFor = (analysis: Analysis) => listingFor(analysis).askingPrice;
  const livingAreaFor = (analysis: Analysis) => listingFor(analysis).livingAreaM2 ?? analysis.property.areaM2 ?? null;
  const pricePerM2For = (analysis: Analysis) => {
    const price = askingPriceFor(analysis);
    const area = livingAreaFor(analysis);
    return price != null && area ? Math.round(price / area) : null;
  };
  const signalFor = (analysis: Analysis, key: string) => analysis.signals?.find((item) => item.key === key);
  const roomsFor = (analysis: Analysis) => {
    const listing = listingFor(analysis);
    if (listing.roomCount != null) return t("roomsCount", { count: listing.roomCount });
    if (listing.bedroomCount != null) return t("bedroomsCount", { count: listing.bedroomCount });
    return t("unknown");
  };
  // "Beste waarde" wordt alleen onder de kandidaten bepaald: de huidige woning
  // is de referentie, geen deelnemer aan de keuze.
  const factRows: { key: string; label: string; render: (analysis: Analysis) => string; best?: (analysis: Analysis) => boolean }[] = [
    {
      key: "asking-price",
      label: t("factAskingPrice"),
      render: (analysis) => { const value = askingPriceFor(analysis); return value != null ? formatEuro(value, locale) : t("unknown"); },
      best: (analysis) => { const value = askingPriceFor(analysis); return value != null && analyses.every((other) => { const otherValue = askingPriceFor(other); return otherValue == null || otherValue >= value; }); },
    },
    {
      key: "price-per-m2",
      label: t("factPricePerM2"),
      render: (analysis) => { const value = pricePerM2For(analysis); return value != null ? t("pricePerM2Value", { value: formatEuro(value, locale) }) : t("unknown"); },
      best: (analysis) => { const value = pricePerM2For(analysis); return value != null && analyses.every((other) => { const otherValue = pricePerM2For(other); return otherValue == null || otherValue >= value; }); },
    },
    { key: "area", label: t("factAreaBag"), render: (analysis) => analysis.property.areaM2 ? `${analysis.property.areaM2} m²` : t("unknown") },
    {
      key: "listing-area",
      label: t("factAreaListing"),
      render: (analysis) => { const value = listingFor(analysis).livingAreaM2; return value != null ? `${value} m²` : t("unknown"); },
      best: (analysis) => { const value = listingFor(analysis).livingAreaM2; return value != null && analyses.every((other) => { const otherValue = listingFor(other).livingAreaM2; return otherValue == null || otherValue <= value; }); },
    },
    { key: "rooms", label: t("factRooms"), render: roomsFor },
    { key: "building-year", label: t("factBuildingYear"), render: (analysis) => analysis.property.buildingYear ? String(analysis.property.buildingYear) : t("unknown") },
    { key: "energy", label: t("factEnergyEpOnline"), render: (analysis) => String(signalFor(analysis, "energy")?.value ?? t("noData")) },
    {
      key: "listing-energy",
      label: t("factEnergyListing"),
      render: (analysis) => listingFor(analysis).energyLabel ?? t("unknown"),
    },
    {
      key: "vve-contribution",
      label: t("factVveContribution"),
      render: (analysis) => { const value = listingFor(analysis).vveContribution; return value != null ? t("vveMonthlyValue", { value: formatEuro(value, locale) }) : t("unknown"); },
      best: (analysis) => { const value = listingFor(analysis).vveContribution; return value != null && analyses.every((other) => { const otherValue = listingFor(other).vveContribution; return otherValue == null || otherValue >= value; }); },
    },
    {
      key: "vve",
      label: t("factVveSignal"),
      render: (analysis) => signalFor(analysis, "vve")?.severity === "attention" ? t("vveLikely") : t("vveUnlikely"),
    },
  ];
  const comparisonStorageLabel = authStatus === "authenticated" ? t("storedInAccount") : t("storedInSession");
  return (
    <PageShell current="vergelijken" containerClassName="comparison-page">
      <Link className="back-link" href="/#zoek-adres"><ArrowLeft size={14} /> {t("backToSearch")}</Link>
      <div className="eyebrow"><GitCompare size={13} /> {t("dashboardEyebrow")}</div>
      <div className="compare-heading-row">
        <h1>{t("dashboardTitle")}</h1>
        <button className="secondary-button" type="button" onClick={() => void share()}>{copied ? <Check size={14} /> : <Link2 size={14} />} {copied ? t("copiedLabel") : t("shareLabel")}</button>
      </div>
      <p className="hero-copy">{baseline ? t("dashboardCopyWithCurrent") : t("dashboardCopy")}</p>
      {invalidCount > 0 && <p className="compare-alert" role="status">{t("invalidIdsWarning", { count: invalidCount })}</p>}
      {loadError && <p className="compare-alert" role="alert">{loadError}</p>}
      <section className="comparison-cards">
        {columns.map((analysis) => {
          const currentHome = isBaseline(analysis);
          const selected = workspace.compare.includes(analysis.property.bagVboId);
          const delta = baseline && !currentHome ? scoreDelta(baseline.overallScore, analysis.overallScore) : null;
          return (
            <article className={`comparison-card ${currentHome ? "is-baseline" : ""}`} key={analysis.property.bagVboId}>
              <div className="comparison-card-top">
                <div>
                  <h2>{analysis.property.street} {analysis.property.houseNumber}</h2>
                  <span>{analysis.property.postcode} {analysis.property.city}</span>
                </div>
                {currentHome ? (
                  <span className="baseline-badge"><House size={12} /> {t("currentHomeBadge")}</span>
                ) : (
                  <button className="icon-button" type="button" aria-label={t("removeFromCompareAria")} onClick={async () => {
                    await toggleCompare(analysis.property.bagVboId);
                    const remaining = analyses.filter((item) => item.property.bagVboId !== analysis.property.bagVboId);
                    removeIdsFromUrl(remaining.map((item) => item.property.bagVboId), "ids", 2);
                  }}><X size={15} /></button>
                )}
              </div>
              <div className="comparison-scores">
                <div><small>{t("realityScore")}</small><strong>{formatScore(analysis.overallScore)}</strong></div>
                <div><small>{t("yourFit")}</small><strong>{calculatePersonalFit(analysis, workspace.preferences) != null ? formatScore(calculatePersonalFit(analysis, workspace.preferences) as number) : "—"}</strong></div>
              </div>
              {delta != null && (
                <p className={`compare-delta ${delta > 0 ? "is-better" : delta < 0 ? "is-worse" : ""}`} role="status">
                  {delta >= 0 ? "+" : ""}{formatScore(delta)} {t("versusCurrentHome")}
                </p>
              )}
              <div className="comparison-card-footer">
                <span><Heart size={13} /> {comparisonStorageLabel}</span>
                {!currentHome && selected && <span className="selected-label">{t("selectedLabel")}</span>}
              </div>
            </article>
          );
        })}
      </section>
      <section className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>{t("colFeature")}</th>
              {columns.map((analysis) => (
                <th key={analysis.property.bagVboId} className={isBaseline(analysis) ? "is-baseline-col" : ""}>
                  {isBaseline(analysis) ? `${t("currentHomeBadge")}: ${analysis.property.street} ${analysis.property.houseNumber}` : `${analysis.property.street} ${analysis.property.houseNumber}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {factRows.map((row) => (
              <tr key={row.key}>
                <th>{row.label}</th>
                {columns.map((analysis) => (
                  <td className={row.best?.(analysis) ? "best-value" : ""} key={analysis.property.bagVboId}>{row.render(analysis)}</td>
                ))}
              </tr>
            ))}
            {domains.map((domain) => (
              <tr key={domain.key}>
                <th>{domain.label}</th>
                {columns.map((analysis) => {
                  const value = analysis.domains.find((candidate) => candidate.key === domain.key)?.score;
                  const best = value != null && analyses.every((other) => (other.domains.find((candidate) => candidate.key === domain.key)?.score ?? -1) <= value);
                  return <td className={best ? "best-value" : ""} key={analysis.property.bagVboId}>{value == null ? t("noData") : `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10`}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted-copy">{t("footnote")}</p>
      </section>
    </PageShell>
  );
}
