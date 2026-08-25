"use client";

import { ArrowLeft, GitCompare, Link2, Check, X } from "lucide-react";
import { Link, usePathname } from "@/src/lib/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { CompareEmptyState, removeIdsFromUrl, useShareUrl } from "@/components/comparison-shell";
import { PageShell } from "@/components/ui/page-shell";
import { ComparisonSkeleton } from "@/components/ui/route-skeletons";
import { apiFetch } from "@/components/hooks/use-api";
import { placeKindLabels } from "@/src/lib/place-labels";
import { formatInhabitants, formatWoz, isBestInRow, loadStoredPlaces, placeFactRows, placeRefKey, placeSignalRows, removeStoredPlace, type PlaceRef } from "@/src/lib/place-compare";
import type { PlaceAnalysis } from "@/src/lib/types";

type LoadedPlace = { ref: PlaceRef; place: PlaceAnalysis | null; error?: string };

export function PlaceComparisonDashboard({ initialRefs }: { initialRefs: PlaceRef[] }) {
  const t = useTranslations("vergelijken");
  const locale = useLocale();
  const pathname = usePathname();
  const [refs, setRefs] = useState<PlaceRef[]>(initialRefs);
  const [loaded, setLoaded] = useState<LoadedPlace[]>([]);
  const [loading, setLoading] = useState(true);

  const { copied, share } = useShareUrl(() => {
    const query = refs.map((ref) => `${ref.kind}:${ref.code}`).join(",");
    return `${window.location.origin}/${locale}${pathname}?places=${encodeURIComponent(query)}`;
  }, t("copyPrompt"));

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
        const result = await apiFetch<{ place?: PlaceAnalysis; error?: string }>(`/api/place/${encodeURIComponent(ref.kind)}/${encodeURIComponent(ref.code)}`, { signal: controller.signal });
        if (result.status === 401) return { ref, place: null, error: t("loginRequired") };
        if (!result.ok) return { ref, place: null, error: result.data?.error ?? result.error ?? t("placeLoadFailed") };
        return { ref, place: result.data?.place ?? null };
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
    removeIdsFromUrl(remaining.map((ref) => `${ref.kind}:${ref.code}`), "places");
  }

  if (loading) return <ComparisonSkeleton />;

  const valid = loaded.filter((item): item is LoadedPlace & { place: PlaceAnalysis } => item.place != null);
  if (valid.length < 2) {
    const authError = loaded.find((item) => item.error?.includes(t("loginRequired")));
    return (
      <CompareEmptyState
        titleId="places-empty-title"
        backLabel={t("backSearch")}
        eyebrow={t("placesEyebrow")}
        title={t("placesEmptyTitle")}
        copy={t("placesEmptyCopy")}
        steps={[
          { title: t("placeStep1Title"), text: t("placeStep1Text") },
          { title: t("placeStep2Title"), text: t("placeStep2Text") },
          { title: t("placeStep3Title"), text: t("placeStep3Text") },
        ]}
        ctaLabel={t("placesEmptyCta")}
        alert={authError?.error ? { text: authError.error } : undefined}
      />
    );
  }

  const metricRows = placeSignalRows(valid.map((item) => item.place));
  const factRows = placeFactRows(valid.map((item) => item.place));

  return (
    <PageShell current="vergelijken" containerClassName="comparison-page">
      <Link className="back-link" href="/#zoek-adres"><ArrowLeft size={14} /> {t("backToSearch")}</Link>
      <div className="eyebrow"><GitCompare size={13} /> {t("placesDashEyebrow")}</div>
      <div className="compare-heading-row">
        <h1>{t("dashboardTitle")}</h1>
        <button className="secondary-button" type="button" onClick={() => void share()}>{copied ? <Check size={14} /> : <Link2 size={14} />} {copied ? t("copiedLabel") : t("shareLabel")}</button>
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
                <div><small>{t("avgWoz")}</small><strong>{formatWoz(item.place.cbs?.averageWoz)}</strong></div>
                <div><small>{t("inhabitants")}</small><strong>{formatInhabitants(item.place.cbs?.inhabitants)}</strong></div>
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
