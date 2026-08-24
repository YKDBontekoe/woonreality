"use client";

import { ArrowLeft, GitCompare, Link2, Check, X } from "lucide-react";
import { Link, usePathname } from "@/src/lib/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { ComparisonSkeleton } from "@/components/ui/route-skeletons";
import { placeKindLabels } from "@/src/lib/place-labels";
import { isBestInRow, loadStoredPlaces, placeFactRows, placeRefKey, placeSignalRows, removeStoredPlace, type PlaceRef } from "@/src/lib/place-compare";
import type { PlaceAnalysis } from "@/src/lib/types";

type LoadedPlace = { ref: PlaceRef; place: PlaceAnalysis | null; error?: string };

function PlacesEmptyState({ hint }: { hint?: string }) {
  const t = useTranslations("vergelijken");
  return (
    <PageShell current="vergelijken" className="comparison-shell">
      <section className="comparison-empty" aria-labelledby="places-empty-title">
        <Link className="back-link" href="/#zoek-adres"><ArrowLeft size={14} /> {t("backSearch")}</Link>
        <div className="eyebrow"><GitCompare size={13} /> {t("placesEyebrow")}</div>
        <h1 id="places-empty-title">{t("placesEmptyTitle")}</h1>
        <p className="hero-copy">{t("placesEmptyCopy")}</p>
        {hint ? <p className="compare-alert" role="status">{hint}</p> : null}
        <ol className="comparison-empty-steps">
          <li><span>1</span><div><strong>{t("placeStep1Title")}</strong><small>{t("placeStep1Text")}</small></div></li>
          <li><span>2</span><div><strong>{t("placeStep2Title")}</strong><small>{t("placeStep2Text")}</small></div></li>
          <li><span>3</span><div><strong>{t("placeStep3Title")}</strong><small>{t("placeStep3Text")}</small></div></li>
        </ol>
        <Link className="primary-button" href="/#zoek-adres">{t("placesEmptyCta")}</Link>
      </section>
    </PageShell>
  );
}

export function PlaceComparisonDashboard({ initialRefs }: { initialRefs: PlaceRef[] }) {
  const t = useTranslations("vergelijken");
  const locale = useLocale();
  const pathname = usePathname();
  const [refs, setRefs] = useState<PlaceRef[]>(initialRefs);
  const [loaded, setLoaded] = useState<LoadedPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  async function shareComparison() {
    const query = refs.map((ref) => `${ref.kind}:${ref.code}`).join(",");
    const url = `${window.location.origin}/${locale}${pathname}?places=${encodeURIComponent(query)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt(t("copyPrompt"), url);
    }
  }

  // Session-stored places extend URL refs (e.g. user added one on a place page).
  useEffect(() => {
    const stored = loadStoredPlaces();
    setRefs((current) => {
      const seen = new Set(current.map(placeRefKey));
      return [...current, ...stored.filter((ref) => !seen.has(placeRefKey(ref)))].slice(0, 4);
    });
  }, []);

  useEffect(() => {
    if (!refs.length) {
      setLoaded([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const controller = new AbortController();
    void Promise.all(refs.map(async (ref) => {
      try {
        const response = await fetch(`/api/place/${encodeURIComponent(ref.kind)}/${encodeURIComponent(ref.code)}`, { signal: controller.signal });
        if (response.status === 401) return { ref, place: null, error: t("loginRequired") };
        const body = await response.json() as { place?: PlaceAnalysis; error?: string };
        if (!response.ok) return { ref, place: null, error: body.error ?? t("placeLoadFailed") };
        return { ref, place: body.place ?? null };
      } catch {
        return { ref, place: null, error: t("placeLoadFailed") };
      }
    })).then((results) => {
      if (active) {
        setLoaded(results);
        setLoading(false);
      }
    });
    return () => { active = false; controller.abort(); };
  }, [refs, t]);

  function removeColumn(index: number) {
    removeStoredPlace(refs[index]);
    const remaining = refs.filter((_, position) => position !== index);
    setRefs(remaining);
    // Keep the URL in sync so a refresh does not resurrect removed places.
    const url = new URL(window.location.href);
    if (remaining.length >= 1) url.searchParams.set("places", remaining.map((ref) => `${ref.kind}:${ref.code}`).join(","));
    else url.searchParams.delete("places");
    window.history.replaceState(null, "", url.toString());
  }

  if (loading) return <ComparisonSkeleton />;

  const valid = loaded.filter((item): item is LoadedPlace & { place: PlaceAnalysis } => item.place != null);
  if (valid.length < 2) {
    const authError = loaded.find((item) => item.error?.includes(t("loginRequired")));
    return <PlacesEmptyState hint={authError?.error} />;
  }

  const metricRows = placeSignalRows(valid.map((item) => item.place));
  const factRows = placeFactRows(valid.map((item) => item.place));

  return (
    <PageShell current="vergelijken" containerClassName="comparison-page">
      <Link className="back-link" href="/#zoek-adres"><ArrowLeft size={14} /> {t("backToSearch")}</Link>
      <div className="eyebrow"><GitCompare size={13} /> {t("placesDashEyebrow")}</div>
      <div className="compare-heading-row">
        <h1>{t("dashboardTitle")}</h1>
        <button className="secondary-button" type="button" onClick={() => void shareComparison()}>{copied ? <Check size={14} /> : <Link2 size={14} />} {copied ? t("copiedLabel") : t("shareLabel")}</button>
      </div>
      <p className="hero-copy">{t("placesDashCopy")}</p>
        <section className="comparison-cards">
          {valid.map((item, index) => (
            <article className="comparison-card" key={placeRefKey(item.ref)}>
              <div className="comparison-card-top">
                <div>
                  <h2>{item.place.name}</h2>
                  <span>{placeKindLabels[item.place.kind]}{item.place.subtitle ? ` · ${item.place.subtitle}` : ""}</span>
                </div>
                <button className="icon-button" type="button" aria-label={t("removeFromCompareAria")} onClick={() => removeColumn(index)}>
                  <X size={15} />
                </button>
              </div>
              <div className="comparison-scores">
                <div><small>{t("avgWoz")}</small><strong>{item.place.cbs?.averageWoz != null ? `€ ${Math.round(item.place.cbs.averageWoz).toLocaleString("nl-NL")}` : "—"}</strong></div>
                <div><small>{t("inhabitants")}</small><strong>{item.place.cbs?.inhabitants?.toLocaleString("nl-NL") ?? "—"}</strong></div>
              </div>
              <div className="comparison-card-footer">
                <Link href={`/plek/${item.place.kind}/${encodeURIComponent(item.place.code)}`}>{t("openPlacePage")}</Link>
              </div>
            </article>
          ))}
        </section>
        <section className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>{t("colMetric")}</th>
                {valid.map((item) => <th key={placeRefKey(item.ref)}>{item.place.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {factRows.map((row) => (
                <tr key={`fact-${row.key}`}>
                  <th>{row.label}</th>
                  {row.values.map((value, index) => <td key={index}>{value ?? "—"}</td>)}
                </tr>
              ))}
              {metricRows.map((row) => (
                <tr key={`metric-${row.key}`}>
                  <th>{row.label}{row.unit ? ` (${row.unit})` : ""}</th>
                  {row.values.map((value, index) => (
                    <td key={index} className={isBestInRow(row.values, index, row.higherIsBetter) ? "best-value" : ""}>
                      {value != null ? value.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <p className="dashboard-disclaimer">{t("placesDisclaimer")}</p>
    </PageShell>
  );
}
