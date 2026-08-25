import {
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CircleAlert,
  FileQuestion,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { confidenceLabel } from "@/src/lib/analysis/evidence";
import { normalizeLocale } from "@/src/lib/i18n/config";
import type { Locale } from "@/src/lib/i18n/config";
import { formatEuro } from "@/src/lib/purchase";
import type { AiPropertyReport, AiReportStatus, Analysis, PropertyListing } from "@/src/lib/types";

function propertyFacts(analysis: Analysis, listing: PropertyListing | null, locale: Locale) {
  const facts = [
    analysis.property.areaM2 ? { key: "bagArea", value: `${analysis.property.areaM2} m²` } : null,
    analysis.property.buildingYear ? { key: "yearBuilt", value: String(analysis.property.buildingYear) } : null,
    listing?.askingPrice ? { key: "askingPrice", value: formatEuro(listing.askingPrice, locale) } : null,
    listing?.energyLabel ? { key: "energyLabel", value: listing.energyLabel } : null,
  ].filter((fact): fact is { key: string; value: string } => fact != null);

  return facts.slice(0, 4);
}

export function AiDecisionBrief({
  analysis,
  listing,
  report,
  status,
  onOpenSignals,
  onOpenChecklist,
}: {
  analysis: Analysis;
  listing: PropertyListing | null;
  report: AiPropertyReport | null;
  status: AiReportStatus;
  onOpenSignals: () => void;
  onOpenChecklist: () => void;
}) {
  const t = useTranslations("woning");
  const locale = normalizeLocale(useLocale());
  if (status === "unavailable") return null;

  const facts = propertyFacts(analysis, listing, locale);
  const attention = report?.findings.filter((finding) => finding.impact === "attention").slice(0, 3) ?? [];
  const positives = report?.findings.filter((finding) => finding.impact === "positive").slice(0, 2) ?? [];
  const questions = report?.questions.slice(0, 3) ?? [];
  const hasReport = report != null;

  return (
    <section className="ai-decision-brief" aria-labelledby="ai-decision-brief-title">
      <header className="ai-decision-brief-head">
        <div>
          <div className="section-kicker"><Bot size={12} /> {t("aiBrief.kicker")}</div>
          <h2 id="ai-decision-brief-title">
            {hasReport ? report.verdict.title : status === "failed" ? t("aiBrief.failedTitle") : t("aiBrief.generatingTitle")}
          </h2>
          <p>
            {hasReport
              ? report.verdict.summary
              : status === "failed"
                ? t("aiBrief.failedCopy")
                : t("aiBrief.generatingCopy")}
          </p>
        </div>
        <div className="ai-decision-brief-trust">
          <BadgeCheck size={15} />
          <span>{hasReport ? confidenceLabel(report.verdict.confidence) : t("aiBrief.sourcesChecked")}</span>
        </div>
      </header>

      <div className="ai-decision-brief-grid">
        <article className="ai-brief-card ai-brief-card-verdict">
          <div className="ai-brief-card-label"><Sparkles size={13} /> {t("aiBrief.purchasePicture")}</div>
          <strong>{hasReport ? t("aiBrief.verdictReady") : t("aiBrief.verdictPending")}</strong>
          <div className="ai-brief-facts" aria-label={t("aiBrief.factsAria")}>
            {facts.map((fact) => <span key={fact.key}><small>{t(`aiBrief.facts.${fact.key}`)}</small>{fact.value}</span>)}
          </div>
          <button className="text-link ai-brief-link" type="button" onClick={onOpenSignals}>
            {t("aiBrief.viewAllSignals")} <ArrowUpRight size={13} />
          </button>
        </article>

        <article className="ai-brief-card ai-brief-card-evidence">
          <div className="ai-brief-card-label"><ScanSearch size={13} /> {t("aiBrief.researchFrame")}</div>
          <strong>{hasReport ? t("aiBrief.sourcesReviewed", { count: report.coverage.sourceCount }) : t("aiBrief.dataPointsAvailable", { available: analysis.dataCoverage.available, total: analysis.dataCoverage.total })}</strong>
          <dl className="ai-brief-coverage">
            <div><dt>{t("aiBrief.openDataSources")}</dt><dd>{analysis.dataCoverage.label}</dd></div>
            {hasReport && <div><dt>{t("aiBrief.aiSearched")}</dt><dd>{report.coverage.searched.slice(0, 2).join(" · ") || t("aiBrief.additionalPublicSources")}</dd></div>}
            {hasReport && report.coverage.missing.length > 0 && <div><dt>{t("aiBrief.stillUnknown")}</dt><dd>{report.coverage.missing.slice(0, 2).join(" · ")}</dd></div>}
          </dl>
        </article>
      </div>

      {(attention.length > 0 || positives.length > 0) && (
        <section className="ai-brief-findings" aria-label={t("aiBrief.findingsAria")}>
          <div className="ai-brief-section-head"><div><div className="section-kicker">{t("aiBrief.changesDecision")}</div><h3>{t("aiBrief.coreWithReason")}</h3></div><span>{t("aiBrief.findingsCount", { count: attention.length + positives.length })}</span></div>
          <div className="ai-brief-finding-grid">
            {attention.map((finding) => (
              <article className="ai-brief-finding is-attention" key={finding.id}>
                <CircleAlert size={15} /><div><strong>{finding.title}</strong><p>{finding.summary}</p><small>{finding.spatialScale ?? t("aiBrief.areaScale")} · {confidenceLabel(finding.confidence)}</small></div>
              </article>
            ))}
            {positives.map((finding) => (
              <article className="ai-brief-finding is-positive" key={finding.id}>
                <BadgeCheck size={15} /><div><strong>{finding.title}</strong><p>{finding.summary}</p><small>{finding.spatialScale ?? t("aiBrief.areaScale")} · {confidenceLabel(finding.confidence)}</small></div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="ai-brief-bottom-grid">
        <section className="ai-brief-life" aria-labelledby="ai-brief-life-title">
          <div className="section-kicker">{t("aiBrief.everydayKicker")}</div>
          <h3 id="ai-brief-life-title">{t("aiBrief.everydayHeading")}</h3>
          {analysis.everydayInsights.length ? (
            <ul>
              {analysis.everydayInsights.slice(0, 3).map((insight) => <li className={`is-${insight.tone}`} key={insight.title}><i /><div><strong>{insight.title}</strong><span>{insight.summary}</span></div></li>)}
            </ul>
          ) : <p>{t("aiBrief.noEverydayYet")}</p>}
        </section>

        <section className="ai-brief-actions" aria-labelledby="ai-brief-actions-title">
          <div className="section-kicker"><FileQuestion size={12} /> {t("aiBrief.reduceUncertainty")}</div>
          <h3 id="ai-brief-actions-title">{t("aiBrief.takeToViewing")}</h3>
          {questions.length ? <ol>{questions.map((question) => <li key={question}>{question}</li>)}</ol> : <p>{t("aiBrief.questionsPending")}</p>}
          <button className="secondary-button" type="button" onClick={onOpenChecklist}>{t("aiBrief.openFullChecklist")} <ArrowUpRight size={13} /></button>
        </section>
      </div>

      {hasReport && report.contradictions.length > 0 && (
        <section className="ai-brief-crosscheck" aria-label={t("aiBrief.contradictionsAria")}>
          <CircleAlert size={15} /><div><strong>{t("aiBrief.contradictionsCount", { count: report.contradictions.length })}</strong><span>{report.contradictions.slice(0, 2).map((item) => item.summary).join(" ")}</span></div><button className="text-link" type="button" onClick={onOpenSignals}>{t("aiBrief.checkSignals")} <ArrowUpRight size={13} /></button>
        </section>
      )}
    </section>
  );
}
