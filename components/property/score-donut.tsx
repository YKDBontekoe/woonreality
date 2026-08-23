import { scoreBand } from "@/src/lib/report-summary";

export function ScoreDonut({
  score,
  size = "md",
}: {
  score: number;
  size?: "md" | "lg";
}) {
  const clamped = Math.max(0, Math.min(10, score));
  const radius = size === "lg" ? 46 : 36;
  const view = size === "lg" ? 120 : 96;
  const cx = view / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - clamped / 10);
  const stroke = scoreBand(score) === "attention" ? "var(--attention)" : "var(--accent)";

  return (
    // The number lives inside the SVG; expose it as one labelled image so
    // screen-reader users hear the score instead of an empty graphic.
    <svg
      className={`dash-donut is-${size}`}
      viewBox={`0 0 ${view} ${view}`}
      role="img"
      aria-label={`Score ${clamped.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} van 10`}
      style={{ "--donut-circ": circ, "--donut-offset": offset } as React.CSSProperties}
    >
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="var(--line)" strokeWidth={size === "lg" ? 10 : 8} aria-hidden="true" />
      <circle
        className="dash-donut-arc"
        cx={cx}
        cy={cx}
        r={radius}
        fill="none"
        stroke={stroke}
        strokeWidth={size === "lg" ? 10 : 8}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
        aria-hidden="true"
      />
      <text
        className="dash-donut-number"
        x={cx}
        y={cx + (size === "lg" ? 8 : 6)}
        textAnchor="middle"
        fontSize={size === "lg" ? 28 : 18}
        fontFamily="DM Sans, sans-serif"
        fontWeight="600"
        fill="var(--ink)"
        aria-hidden="true"
      >
        {clamped.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
      </text>
    </svg>
  );
}
