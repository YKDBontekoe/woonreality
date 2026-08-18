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
  const stroke = {
    good: "var(--ok)",
    neutral: "var(--accent)",
    attention: "var(--attention)",
  }[scoreBand(score)];

  return (
    <svg className={`dash-donut is-${size}`} viewBox={`0 0 ${view} ${view}`} aria-hidden="true">
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="var(--line)" strokeWidth={size === "lg" ? 10 : 8} />
      <circle
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
      />
      <text
        x={cx}
        y={cx + (size === "lg" ? 8 : 6)}
        textAnchor="middle"
        fontSize={size === "lg" ? 28 : 18}
        fontFamily="Space Grotesk, sans-serif"
        fontWeight="600"
        fill="var(--ink)"
      >
        {clamped.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
      </text>
    </svg>
  );
}
