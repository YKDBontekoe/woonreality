import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PrintButton } from "@/components/print-button";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import { isValidBagId } from "@/src/lib/validation/workspace";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "woning" });
  const bagId = decodeURIComponent(slug);
  if (!isValidBagId(bagId)) return { title: t("meta.title") };
  try {
    const property = await getPropertyById(bagId);
    const label = `${property.street} ${property.houseNumber}${property.houseLetter ?? ""}${property.addition ?? ""}, ${property.city}`;
    return {
      title: t("meta.reportTitle", { label }),
      robots: { index: false },
    };
  } catch {
    return { title: t("meta.title"), robots: { index: false } };
  }
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [t, tc] = await Promise.all([getTranslations("woning"), getTranslations("common")]);
  const bagId = decodeURIComponent(slug);
  if (!isValidBagId(bagId)) notFound();

  let error = "";
  let report: Awaited<ReturnType<typeof buildReport>> | null = null;
  try {
    report = await buildReport(bagId, locale);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : t("report.loadFailed");
  }

  if (error || !report) {
    return (
      <main className="site-shell offer-memo-shell">
        <div className="container">
          <Breadcrumbs items={[{ href: `/woning/${slug}`, label: tc("breadcrumbCheck") }, { label: t("report.breadcrumb") }]} />
          <h1>{t("report.loadFailed")}</h1>
          <p className="hero-copy" role="alert">{error}</p>
        </div>
      </main>
    );
  }

  const { analysis, generatedAtLabel, formatDate } = report;
  return (
    <main className="site-shell offer-memo-shell">
      <div className="container">
        <div className="offer-memo-toolbar no-print">
          <Breadcrumbs items={[{ href: `/woning/${slug}`, label: tc("breadcrumbCheck") }, { label: t("report.breadcrumb") }]} />
          <PrintButton />
        </div>
        <article className="offer-memo woning-rapport" aria-label={t("report.aria")}>
          <header className="offer-memo-head">
            <small>{t("report.kicker")} · {generatedAtLabel}</small>
            <h1>{analysis.property.addressLabel}</h1>
            <p>{analysis.property.postcode} {analysis.property.city}{analysis.property.municipality ? ` · ${analysis.property.municipality}` : ""}</p>
          </header>

          <section className="rapport-verdict">
            <span>{t("report.scoreLabel")}</span>
            <strong>{analysis.overallScore.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
            <small>{t("report.versionLabel", { analysis: analysis.analysisVersion, scoring: analysis.scoringVersion })}</small>
          </section>

          {analysis.highlights.length > 0 && (
            <section>
              <h2>{t("report.highlightsTitle")}</h2>
              <ul>
                {analysis.highlights.map((highlight, index) => (
                  <li key={`${highlight.signalKey}-${index}`}>{highlight.text}</li>
                ))}
              </ul>
            </section>
          )}

          {analysis.domains.map((domain) => (
            <section key={domain.key}>
              <h2>{domain.label}{domain.score != null ? ` — ${domain.score.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : ""}</h2>
              <p className="rapport-domain-summary">{domain.summary}</p>
              <ul className="rapport-signal-list">
                {domain.signalKeys.map((signalKey) => {
                  const signal = analysis.signals.find((item) => item.key === signalKey);
                  if (!signal) return null;
                  return (
                    <li key={signal.key}>
                      <strong>{signal.label}</strong>
                      <span>{[typeof signal.value === "number" ? signal.value.toLocaleString("nl-NL") : signal.value, signal.unit, signal.summary].filter(Boolean).join(" — ")}</span>
                      {signal.availability === "unavailable" && <em>{t("report.unavailableLabel")}</em>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {analysis.dataCoverage && (
            <p className="rapport-coverage">{t("report.coverageLabel", { available: analysis.dataCoverage.available, total: analysis.dataCoverage.total })} · {analysis.dataCoverage.label}</p>
          )}

          {analysis.knownGaps.length > 0 && (
            <section>
              <h2>{t("report.gapsTitle")}</h2>
              <ul>
                {analysis.knownGaps.map((gap) => (
                  <li key={gap.key}>
                    <strong>{gap.label}</strong> — {gap.summary}{" "}
                    (<a href={gap.checkUrl} target="_blank" rel="noreferrer noopener">{gap.checkLabel}</a>)
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2>{t("report.evidenceTitle")}</h2>
            <table className="rapport-evidence">
              <thead>
                <tr><th>{t("report.evidenceSource")}</th><th>{t("report.evidenceFetched")}</th><th>{t("report.evidenceConfidence")}</th></tr>
              </thead>
              <tbody>
                {analysis.evidence.map((item) => (
                  <tr key={item.id}>
                    <td><a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">{item.source}</a></td>
                    <td>{formatDate(item.fetchedAt)}</td>
                    <td>{Math.round(Number(item.confidence) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="offer-memo-footer">{t("report.disclaimer")}</footer>
        </article>
      </div>
    </main>
  );
}

async function buildReport(bagId: string, locale: string) {
  const property = await getPropertyById(bagId);
  const analysis = await getSharedAnalysis(property);
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "long" });
  return {
    analysis,
    generatedAtLabel: formatter.format(new Date(analysis.generatedAt)),
    formatDate: (value: string) => formatter.format(new Date(value)),
  };
}
