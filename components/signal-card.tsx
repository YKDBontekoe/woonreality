import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { SignalInterpretationBlock } from "@/components/property/signal-interpretation";
import { confidenceLabel } from "@/src/lib/analysis/evidence";
import type { SignalInterpretation } from "@/src/lib/signal-interpretation";
import type { Signal } from "@/src/lib/types";
import { formatRelativeTime } from "@/src/lib/format-relative";

function evidenceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nl-NL");
}

export function SignalCard({
  signal,
  interpretation,
}: {
  signal: Signal;
  interpretation?: SignalInterpretation | null;
}) {
  const t = useTranslations("woning");
  const score = typeof signal.score === "number" ? Math.round(signal.score * 10) : undefined;
  const value =
    typeof signal.value === "number"
      ? signal.value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })
      : signal.value;
  const context = [confidenceLabel(signal.confidence), signal.spatialScale].filter(Boolean).join(" · ");
  const unavailable = signal.availability === "unavailable";

  return (
    <article className="signal-card">
      <div className="signal-card-top">
        <div className="signal-title">
          {/* The dot alone is colour-only; the hidden text carries the verdict to
              screen readers and colour-blind users. */}
          <span className={`signal-dot ${signal.severity}`} aria-hidden="true" />
          <span className="sr-only">{t(`signalCard.severity.${signal.severity}`)}</span>
          <div>
            <h3>{signal.label}</h3>
            <small className="signal-category">{signal.category}</small>
          </div>
        </div>
        <div className="signal-value">
          {unavailable ? (
            t("noData")
          ) : (
            <>
              {value}
              {signal.unit && <small className="signal-value-unit">{signal.unit}</small>}
            </>
          )}
        </div>
      </div>
      {interpretation && <SignalInterpretationBlock interpretation={interpretation} />}
      <p className="signal-summary">{signal.summary}</p>
      <p className="signal-context">
        <span className="sr-only">{t("signalCard.dataQuality")}</span>{context}
      </p>
      <div className="signal-action">
        <strong>{t("checkThis")}</strong> {signal.action}
      </div>
      {!unavailable && typeof signal.score === "number" && (
        // Convey the bar's meaning as a meter rather than pure decoration.
        <div
          className="signal-bar"
          role="meter"
          aria-valuenow={Math.round(signal.score * 10) / 10}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-label={t("signalCard.meterAria", { label: signal.label, score: signal.score.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) })}
        >
          <div
            className={`signal-bar-fill ${signal.severity}`}
            style={{ width: `${Math.max(0, Math.min(100, score!))}%` }}
          />
        </div>
      )}
      <details className="evidence-list">
        <summary>{t("signalCard.whySeeing")}</summary>
        <div className="evidence-content">
          {signal.evidence.map((evidence) => (
            <div key={evidence.id}>
              <strong>{evidence.source}</strong>
              {evidence.caveat && <> · {evidence.caveat}</>}{" "}
              <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={9} style={{ verticalAlign: "-1px" }} /> {t("signalCard.sourceLink")}
                <span className="sr-only">{t("signalCard.opensNewTab")}</span>
              </a>
              <small>
                <span title={new Date(evidence.fetchedAt).toLocaleString("nl-NL")}>{t("signalCard.fetchedAt", { time: formatRelativeTime(evidence.fetchedAt) })}</span>
                {evidence.sourceUpdatedAt ? t("signalCard.sourceData", { date: evidenceDate(evidence.sourceUpdatedAt) }) : ""}
                {evidence.sourceRecordId ? t("signalCard.recordId", { id: evidence.sourceRecordId }) : ""}
              </small>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}
