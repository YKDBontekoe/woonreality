"use client";

import { Settings2 } from "lucide-react";
import { PropertyKpiStrip } from "@/components/property/kpi-strip";
import { ScoreDonut } from "@/components/property/score-donut";
import { buildVerdict, topThings, type TopThing } from "@/src/lib/report-summary";
import { preferenceLabel } from "@/src/lib/personalization";
import type { Analysis, PersonalPreferences, PropertyListing } from "@/src/lib/types";

function personalFitLabel(score: number) {
  if (score >= 7) return "Goede match met je voorkeuren";
  if (score >= 5) return "Redelijke match met je voorkeuren";
  return "Minder match met je voorkeuren";
}

function firstSentence(text: string) {
  const match = text.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? text).trim();
}

export function VerdictHero({
  analysis,
  listing,
  personalFit,
  preferencesConfigured,
  showPreferences,
  onTogglePreferences,
  preferences,
  onPreferenceChange,
  onSavePreferences,
  onJumpToSignal,
}: {
  analysis: Analysis;
  listing: PropertyListing | null;
  personalFit: number | null;
  preferencesConfigured: boolean;
  showPreferences: boolean;
  onTogglePreferences: () => void;
  preferences: PersonalPreferences;
  onPreferenceChange: (key: keyof PersonalPreferences, value: number) => void;
  onSavePreferences: () => void;
  onJumpToSignal: (thing: TopThing) => void;
}) {
  const verdict = buildVerdict(analysis);
  const things = topThings(analysis, 3);
  const hasListingFacts = Boolean(
    listing?.askingPrice || listing?.livingAreaM2 || listing?.constructionYear || listing?.energyLabel,
  );

  return (
    <section className={`dash-verdict-hero is-${verdict.tone}`} id="overzicht">
      <div className="dash-verdict-main">
        <div className="dash-verdict-score">
          <ScoreDonut score={analysis.overallScore} size="lg" />
          <div>
            <div className="section-kicker">Omgevingsscore</div>
            <h2 className="dash-verdict-headline">{verdict.headline}</h2>
            <p className="dash-verdict-summary">{verdict.summary}</p>
          </div>
        </div>
        <div className="dash-verdict-fit">
          <div className="dash-verdict-fit-head">
            <span>Persoonlijke fit</span>
            <strong>{personalFit != null ? personalFit.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) : "—"}</strong>
          </div>
          <small>{personalFit != null ? personalFitLabel(personalFit) : "Stel je voorkeuren in voor een persoonlijke match."}</small>
          <button className="ghost-button" type="button" onClick={onTogglePreferences}>
            <Settings2 size={14} />
            {showPreferences ? "Sluiten" : preferencesConfigured ? "Voorkeuren" : "Stel voorkeuren in"}
          </button>
          {showPreferences && (
            <div className="preference-controls dash-verdict-preferences">
              {(Object.keys(preferences) as (keyof PersonalPreferences)[]).map((key) => {
                const inputId = `hero-preference-${key}`;
                return (
                  <div className="preference-control" key={key}>
                    <label htmlFor={inputId}>{preferenceLabel(key)}</label>
                    <input
                      id={inputId}
                      type="range"
                      min="1"
                      max="5"
                      value={preferences[key]}
                      onChange={(event) => onPreferenceChange(key, Number(event.target.value))}
                    />
                    <output htmlFor={inputId}>{preferences[key]}</output>
                  </div>
                );
              })}
              <button className="primary-button" type="button" onClick={onSavePreferences}>
                Bewaar voorkeuren
              </button>
            </div>
          )}
        </div>
      </div>
      {things.length > 0 && (
        <div className="dash-verdict-things">
          <div className="section-kicker">3 dingen om te weten</div>
          <ul className="dash-verdict-thing-grid">
            {things.map((thing) => (
              <li key={`${thing.title}-${thing.text.slice(0, 24)}`}>
                <button
                  type="button"
                  className={`dash-verdict-thing is-${thing.tone}`}
                  onClick={() => onJumpToSignal(thing)}
                >
                  <em>{thing.tone === "good" ? "Plus" : thing.tone === "attention" ? "Let op" : "Context"}</em>
                  <strong>{thing.title}</strong>
                  <span>{firstSentence(thing.text)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasListingFacts && <PropertyKpiStrip analysis={analysis} listing={listing} variant="compact" />}
    </section>
  );
}

export type { TopThing };
