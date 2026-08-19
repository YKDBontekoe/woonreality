import {
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CircleAlert,
  FileQuestion,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { confidenceLabel } from "@/src/lib/analysis/evidence";
import type { AiPropertyReport, AiReportStatus, Analysis, PropertyListing } from "@/src/lib/types";

function formatEuro(value: number | undefined) {
  return value == null
    ? null
    : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function propertyFacts(analysis: Analysis, listing: PropertyListing | null) {
  const facts = [
    analysis.property.areaM2 ? { label: "BAG-oppervlakte", value: `${analysis.property.areaM2} m²` } : null,
    analysis.property.buildingYear ? { label: "Bouwjaar", value: String(analysis.property.buildingYear) } : null,
    listing?.askingPrice ? { label: "Vraagprijs", value: formatEuro(listing.askingPrice) ?? "—" } : null,
    listing?.energyLabel ? { label: "Energielabel", value: listing.energyLabel } : null,
  ].filter((fact): fact is { label: string; value: string } => fact != null);

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
  if (status === "unavailable") return null;

  const facts = propertyFacts(analysis, listing);
  const attention = report?.findings.filter((finding) => finding.impact === "attention").slice(0, 3) ?? [];
  const positives = report?.findings.filter((finding) => finding.impact === "positive").slice(0, 2) ?? [];
  const questions = report?.questions.slice(0, 3) ?? [];
  const hasReport = report != null;

  return (
    <section className="ai-decision-brief" aria-labelledby="ai-decision-brief-title">
      <header className="ai-decision-brief-head">
        <div>
          <div className="section-kicker"><Bot size={12} /> AI-koopbrief</div>
          <h2 id="ai-decision-brief-title">
            {hasReport ? report.verdict.title : status === "failed" ? "AI-koopbrief tijdelijk niet beschikbaar" : "De koopbrief wordt samengesteld…"}
          </h2>
          <p>
            {hasReport
              ? report.verdict.summary
              : status === "failed"
                ? "De openbare woningcheck blijft volledig beschikbaar. Probeer het AI-onderzoek later opnieuw."
                : "Open data, advertentie-informatie en extra brononderzoek worden samengebracht tot een controleerbaar koopbeeld."}
          </p>
        </div>
        <div className="ai-decision-brief-trust">
          <BadgeCheck size={15} />
          <span>{hasReport ? confidenceLabel(report.verdict.confidence) : "Bronnen worden gecontroleerd"}</span>
        </div>
      </header>

      <div className="ai-decision-brief-grid">
        <article className="ai-brief-card ai-brief-card-verdict">
          <div className="ai-brief-card-label"><Sparkles size={13} /> Het koopbeeld</div>
          <strong>{hasReport ? "AI koppelt signalen aan jouw volgende besluit." : "Nog even geduld: het oordeel krijgt bronverwijzingen mee."}</strong>
          <div className="ai-brief-facts" aria-label="Bekende woningfeiten">
            {facts.map((fact) => <span key={fact.label}><small>{fact.label}</small>{fact.value}</span>)}
          </div>
          <button className="text-link ai-brief-link" type="button" onClick={onOpenSignals}>
            Bekijk alle openbare signalen <ArrowUpRight size={13} />
          </button>
        </article>

        <article className="ai-brief-card ai-brief-card-evidence">
          <div className="ai-brief-card-label"><ScanSearch size={13} /> Onderzoekskader</div>
          <strong>{hasReport ? `${report.coverage.sourceCount} aanvullende bronnen bekeken` : `${analysis.dataCoverage.available} van ${analysis.dataCoverage.total} datapunten beschikbaar`}</strong>
          <dl className="ai-brief-coverage">
            <div><dt>Open databronnen</dt><dd>{analysis.dataCoverage.label}</dd></div>
            {hasReport && <div><dt>AI onderzocht</dt><dd>{report.coverage.searched.slice(0, 2).join(" · ") || "Aanvullende openbare bronnen"}</dd></div>}
            {hasReport && report.coverage.missing.length > 0 && <div><dt>Nog onbekend</dt><dd>{report.coverage.missing.slice(0, 2).join(" · ")}</dd></div>}
          </dl>
        </article>
      </div>

      {(attention.length > 0 || positives.length > 0) && (
        <section className="ai-brief-findings" aria-label="Belangrijkste AI-bevindingen">
          <div className="ai-brief-section-head"><div><div className="section-kicker">Wat verandert je besluit?</div><h3>De kern, met reden</h3></div><span>{attention.length + positives.length} bevindingen</span></div>
          <div className="ai-brief-finding-grid">
            {attention.map((finding) => (
              <article className="ai-brief-finding is-attention" key={finding.id}>
                <CircleAlert size={15} /><div><strong>{finding.title}</strong><p>{finding.summary}</p><small>{finding.spatialScale ?? "omgeving"} · {confidenceLabel(finding.confidence)}</small></div>
              </article>
            ))}
            {positives.map((finding) => (
              <article className="ai-brief-finding is-positive" key={finding.id}>
                <BadgeCheck size={15} /><div><strong>{finding.title}</strong><p>{finding.summary}</p><small>{finding.spatialScale ?? "omgeving"} · {confidenceLabel(finding.confidence)}</small></div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="ai-brief-bottom-grid">
        <section className="ai-brief-life" aria-labelledby="ai-brief-life-title">
          <div className="section-kicker">Wonen op een gewone dag</div>
          <h3 id="ai-brief-life-title">Wat je hier waarschijnlijk merkt</h3>
          {analysis.everydayInsights.length ? (
            <ul>
              {analysis.everydayInsights.slice(0, 3).map((insight) => <li className={`is-${insight.tone}`} key={insight.title}><i /><div><strong>{insight.title}</strong><span>{insight.summary}</span></div></li>)}
            </ul>
          ) : <p>Er zijn nog geen dagelijkse inzichten beschikbaar voor dit adres.</p>}
        </section>

        <section className="ai-brief-actions" aria-labelledby="ai-brief-actions-title">
          <div className="section-kicker"><FileQuestion size={12} /> Maak onzekerheid kleiner</div>
          <h3 id="ai-brief-actions-title">Neem mee naar de bezichtiging</h3>
          {questions.length ? <ol>{questions.map((question) => <li key={question}>{question}</li>)}</ol> : <p>De AI-vragen verschijnen zodra het onderzoek klaar is.</p>}
          <button className="secondary-button" type="button" onClick={onOpenChecklist}>Open volledige checklist <ArrowUpRight size={13} /></button>
        </section>
      </div>

      {hasReport && report.contradictions.length > 0 && (
        <section className="ai-brief-crosscheck" aria-label="Gegevens die niet helemaal overeenkomen">
          <CircleAlert size={15} /><div><strong>AI zag {report.contradictions.length} gegeven{report.contradictions.length === 1 ? "" : "s"} om te controleren</strong><span>{report.contradictions.slice(0, 2).map((item) => item.summary).join(" ")}</span></div><button className="text-link" type="button" onClick={onOpenSignals}>Controleer signalen <ArrowUpRight size={13} /></button>
        </section>
      )}
    </section>
  );
}
