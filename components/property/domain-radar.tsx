"use client";

import { useTranslations } from "next-intl";
import { scoreBand } from "@/src/lib/report-summary";
import type { DomainSummary, SignalCategory } from "@/src/lib/types";

const CX = 150;
const CY = 128;
const R = 80;
const LEVELS = [2.5, 5, 7.5, 10];

function pointFor(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + Math.cos(rad) * radius, y: CY + Math.sin(rad) * radius };
}

function labelAnchor(angleDeg: number): "start" | "middle" | "end" {
  const cos = Math.cos((angleDeg * Math.PI) / 180);
  if (Math.abs(cos) < 0.35) return "middle";
  return cos > 0 ? "start" : "end";
}

export function DomainRadar({
  domains,
  onSelectDomain,
}: {
  domains: DomainSummary[];
  onSelectDomain?: (key: SignalCategory) => void;
}) {
  const t = useTranslations("woning");
  const step = 360 / domains.length;
  const scored = domains.filter((domain) => domain.score != null);

  const polygonPoints = domains
    .map((domain, index) => {
      const angle = -90 + index * step;
      const value = domain.score != null ? Math.max(0.4, domain.score) : 0;
      const point = pointFor(angle, (value / 10) * R);
      return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    })
    .join(" ");

  function handleKey(event: React.KeyboardEvent, key: SignalCategory) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectDomain?.(key);
    }
  }

  return (
    <svg
      className="domain-radar"
      viewBox="0 0 300 256"
      role="img"
      aria-label={t("charts.radarAria")}
    >
      {LEVELS.map((level) => (
        <polygon
          aria-hidden="true"
          className="domain-radar-ring"
          key={level}
          points={domains
            .map((_, index) => {
              const point = pointFor(-90 + index * step, (level / 10) * R);
              return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
            })
            .join(" ")}
        />
      ))}
      {domains.map((domain, index) => {
        const outer = pointFor(-90 + index * step, R);
        return (
          <line
            aria-hidden="true"
            className="domain-radar-axis"
            key={domain.key}
            x1={CX}
            y1={CY}
            x2={outer.x}
            y2={outer.y}
          />
        );
      })}
      {scored.length >= 3 && (
        <polygon
          aria-hidden="true"
          className="domain-radar-polygon"
          points={polygonPoints}
        />
      )}
      {domains.map((domain, index) => {
        const angle = -90 + index * step;
        const score = domain.score;
        const tone = scoreBand(score);
        const dot = pointFor(angle, ((Math.max(0.4, score ?? 0)) / 10) * R);
        const label = pointFor(angle, R + 16);
        const anchor = labelAnchor(angle);
        return (
          <g
            className={`domain-radar-label ${onSelectDomain ? "is-clickable" : ""}`}
            key={domain.key}
            role={onSelectDomain ? "button" : undefined}
            tabIndex={onSelectDomain ? 0 : undefined}
            aria-label={
              onSelectDomain
                ? t("charts.domainAria", {
                    label: domain.label,
                    score: score?.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) ?? "—",
                  })
                : undefined
            }
            onClick={() => onSelectDomain?.(domain.key)}
            onKeyDown={(event) => handleKey(event, domain.key)}
          >
            <title>{domain.summary}</title>
            <circle
              aria-hidden="true"
              className={`domain-radar-dot is-${tone} ${score == null ? "is-unscored" : ""}`}
              cx={dot.x}
              cy={dot.y}
              r={4}
            />
            <text
              aria-hidden="true"
              className="domain-radar-name"
              x={label.x}
              y={label.y}
              textAnchor={anchor}
            >
              {domain.label}
            </text>
            <text
              aria-hidden="true"
              className={`domain-radar-score is-${tone}`}
              x={label.x}
              y={label.y + 12}
              textAnchor={anchor}
            >
              {score == null ? "—" : score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
