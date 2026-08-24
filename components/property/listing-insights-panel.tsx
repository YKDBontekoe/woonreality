import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { AiReportStatus, ListingInsights } from "@/src/lib/types";

export function ListingInsightsPanel({
  insights,
  status,
}: {
  insights: ListingInsights | null;
  status: AiReportStatus;
}) {
  const t = useTranslations("woning");
  const [filter, setFilter] = useState("all");
  const topics = insights ? [...new Set(insights.points.map((point) => point.topic))] : [];
  const topicKey = topics.join("\0");

  useEffect(() => {
    setFilter((current) => {
      if (current === "all" || current === "attention") return current;
      return topicKey.split("\0").includes(current) ? current : "all";
    });
  }, [topicKey]);

  if (status === "unavailable") return null;
  if (!insights) {
    return (
      <section className="dash-points" id="omschrijving">
        <div className="section-kicker">{t("insights.fromDescription")}</div>
        <h2>{status === "failed" ? t("insights.extractionFailed") : t("insights.readingDescription")}</h2>
        <p>{status === "failed" ? t("insights.featuresRemain") : t("insights.buyerPointsComing")}</p>
      </section>
    );
  }
  const points = insights.points.filter((point) => {
    if (filter === "all") return true;
    if (filter === "attention") return point.impact === "attention";
    return point.topic === filter;
  });
  return (
    <section className="dash-points" id="omschrijving">
      <div className="section-inline-heading">
        <div>
          <div className="section-kicker">{t("insights.fromDescription")}</div>
          <h2>{insights.headline}</h2>
        </div>
        <span className="coverage-pill">{t("insights.pointsCount", { count: insights.points.length })}</span>
      </div>
      {insights.layout.length > 0 && (
        <div className="dash-layout">
          {insights.layout.map((floor) => (
            <article key={floor.name}>
              <strong>{floor.name}</strong>
              <div>{floor.rooms.map((room) => <span key={room}>{room}</span>)}</div>
            </article>
          ))}
        </div>
      )}
      <div className="dash-point-filters">
        <button aria-pressed={filter === "all"} className={filter === "all" ? "is-on" : ""} type="button" onClick={() => setFilter("all")}>{t("insights.all")}</button>
        <button aria-pressed={filter === "attention"} className={filter === "attention" ? "is-on" : ""} type="button" onClick={() => setFilter("attention")}>{t("insights.payAttention")}</button>
        {topics.slice(0, 8).map((topic) => (
          <button aria-pressed={filter === topic} className={filter === topic ? "is-on" : ""} type="button" key={topic} onClick={() => setFilter(topic)}>
            {topic}
          </button>
        ))}
      </div>
      {points.length > 0 ? (
        <ul className="dash-point-list" aria-live="polite">
          {points.map((point, index) => (
            <li className={`is-${point.impact}`} key={`${point.topic}-${index}`}>
              <em>{point.topic}</em>
              <strong>{point.title}{point.year ? ` · ${point.year}` : ""}</strong>
              <span>{point.summary}</span>
              {point.quote ? (
                <details>
                  <summary>{t("insights.quote")}</summary>
                  <q>{point.quote}</q>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-copy" role="status">{t("insights.emptySelection")}</p>
      )}
    </section>
  );
}
