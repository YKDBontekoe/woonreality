import type { AiPropertyReport, AiReportStatus } from "@/src/lib/types";

export function AiResearchSection({
  report,
  status,
  listingIncomplete = false,
}: {
  report: AiPropertyReport | null;
  status: AiReportStatus;
  listingIncomplete?: boolean;
}) {
  if (status === "unavailable") return null;
  if (!report) {
    return (
      <section className="ai-research-section" id="ai-onderzoek">
        <div className="section-kicker">AI-woningonderzoek</div>
        <h2>
          {status === "failed"
            ? "AI-onderzoek tijdelijk niet beschikbaar"
            : "De woning wordt verder onderzocht…"}
        </h2>
        <p>
          {status === "failed"
            ? "De vaste openbare analyse blijft beschikbaar. Probeer het AI-onderzoek later opnieuw."
            : "We zetten open data, gemeentelijke bronnen en de advertentietekst om in een kort, bronvermeld oordeel."}
        </p>
        {listingIncomplete && status !== "failed" && (
          <p className="ai-listing-hint">
            Koppel de Funda-advertentie via de extensie voor een scherper oordeel over vraagprijs, VvE en eigendom.
          </p>
        )}
      </section>
    );
  }
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
      {listingIncomplete && (
        <p className="ai-listing-hint">
          Nog geen volledige advertentie gekoppeld. Het oordeel steunt nu vooral op open data.
        </p>
      )}
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
          source.url && /^https:\/\//i.test(source.url) ? (
            <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
              {source.title} · {source.publisher ?? source.url}
            </a>
          ) : (
            <span key={source.id} className="ai-source-no-link">
              {source.title} · {source.publisher ?? "geen link beschikbaar"}
            </span>
          )
        ))}
      </details>
    </section>
  );
}
