import { useTranslations } from "next-intl";
import type { Signal } from "@/src/lib/types";

export function SignalGauges({ signals }: { signals: Signal[] }) {
  const t = useTranslations("woning");
  return (
    <section className="dash-gauges" id="signalen">
      <div className="section-inline-heading">
        <div>
          <div className="section-kicker">{t("gauges.openData")}</div>
          <h2>{t("gauges.signalsTitle")}</h2>
        </div>
        <span className="coverage-pill">{signals.length}</span>
      </div>
      <div className="dash-gauge-grid">
        {signals.map((signal) => {
          const score = typeof signal.score === "number" ? signal.score : null;
          return (
            <article className={`dash-gauge is-${signal.severity}`} key={signal.key}>
              <small>{signal.label}</small>
              <strong>
                {signal.availability === "unavailable"
                  ? "—"
                  : score != null
                    ? score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })
                    : String(signal.value)}
              </strong>
              <p>{signal.summary}</p>
              {score != null && signal.availability !== "unavailable" && (
                <div className="signal-bar"><div className={`signal-bar-fill ${signal.severity}`} style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }} /></div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
