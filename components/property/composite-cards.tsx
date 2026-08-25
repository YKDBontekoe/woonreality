"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { CompositeStory, ContradictionFlag } from "@/src/lib/analysis/composites";
import type { TopThing } from "@/components/property/verdict-hero";

export function CompositeCards({
  stories,
  contradictions,
  onJumpToSignal,
}: {
  stories: CompositeStory[];
  contradictions: ContradictionFlag[];
  onJumpToSignal: (thing: TopThing) => void;
}) {
  const t = useTranslations("woning");
  if (!stories.length && !contradictions.length) return null;

  const toThing = (item: { tone?: string; title: string; summary: string; signalKeys: string[] }): TopThing => ({
    tone: item.tone === "good" ? "good" : item.tone === "attention" ? "attention" : "neutral",
    title: item.title,
    text: item.summary,
    signalKeys: item.signalKeys,
  });

  return (
    <section className="dash-composites" aria-label={t("composites.aria")}>
      {stories.length > 0 && (
        <>
          <div className="section-kicker">{t("composites.storiesKicker")}</div>
          <div className="dash-composite-grid">
            {stories.map((story) => (
              <button
                className={`dash-composite-card is-${story.tone}`}
                type="button"
                key={story.key}
                onClick={() => onJumpToSignal(toThing(story))}
              >
                <strong>{story.title}</strong>
                <span>{story.summary}</span>
                <em>{t("composites.basedOn", { count: story.signalKeys.length })} <ArrowRight size={11} /></em>
              </button>
            ))}
          </div>
        </>
      )}
      {contradictions.length > 0 && (
        <>
          <div className="section-kicker">{t("composites.contradictionsKicker")}</div>
          <div className="dash-composite-grid">
            {contradictions.map((flag) => (
              <button
                className={`dash-composite-card is-contradiction severity-${flag.severity}`}
                type="button"
                key={flag.key}
                onClick={() => onJumpToSignal(toThing(flag))}
              >
                <strong><AlertTriangle size={13} aria-hidden="true" /> {flag.title}</strong>
                <span>{flag.summary}</span>
                <em>{flag.action}</em>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
