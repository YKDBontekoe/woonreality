export function ScoreDonut({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(10, score));
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - clamped / 10);
  return (
    <svg className="dash-donut" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="8"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text
        x="48"
        y="52"
        textAnchor="middle"
        fontSize="18"
        fontFamily="Space Grotesk, sans-serif"
        fontWeight="600"
        fill="var(--ink)"
      >
        {clamped.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
      </text>
    </svg>
  );
}
