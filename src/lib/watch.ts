export type WatchComponentDigest = { label: string; score: number };
export type WatchDigest = {
  overallScore: number;
  scoringVersion: string;
  capturedAt: string;
  components: Record<string, WatchComponentDigest>;
};

export type WatchDigestInput = {
  overallScore: number;
  scoringVersion: string;
  generatedAt: string;
  components: { key: string; label?: string | null; score: number }[];
};

export type WatchChange = {
  key: string;
  label: string;
  from: number;
  to: number;
};

export const WATCH_OVERALL_DELTA = 0.3;
export const WATCH_COMPONENT_DELTA = 1;

const round = (value: number) => Math.round(value * 10) / 10;

export function buildWatchDigest(analysis: WatchDigestInput): WatchDigest {
  const components: Record<string, WatchComponentDigest> = {};
  for (const component of analysis.components ?? []) {
    if (!component.key) continue;
    components[component.key] = { label: component.label ?? "", score: round(component.score) };
  }
  return {
    overallScore: round(analysis.overallScore),
    scoringVersion: analysis.scoringVersion,
    capturedAt: analysis.generatedAt,
    components,
  };
}

/**
 * Compare two digests of the same property and report which scored components
 * moved materially. Small deltas are noise: upstream sources refresh on their
 * own cadence, so only shifts beyond the thresholds surface as alerts.
 */
export function diffWatchDigests(previous: WatchDigest, current: WatchDigest): WatchChange[] {
  if (previous.scoringVersion !== current.scoringVersion) return [];
  const changes: WatchChange[] = [];
  const overallDelta = round(current.overallScore - previous.overallScore);
  if (Math.abs(overallDelta) >= WATCH_OVERALL_DELTA) {
    changes.push({ key: "overall", label: "Reality Score", from: previous.overallScore, to: current.overallScore });
  }
  for (const [key, currentComponent] of Object.entries(current.components)) {
    const previousComponent = previous.components[key];
    if (!previousComponent) continue;
    const delta = round(currentComponent.score - previousComponent.score);
    if (Math.abs(delta) >= WATCH_COMPONENT_DELTA) {
      changes.push({
        key,
        label: currentComponent.label || key,
        from: previousComponent.score,
        to: currentComponent.score,
      });
    }
  }
  return changes.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
}

/** Stable id so clients can remember which alerts were already seen. */
export function watchAlertHash(bagVboId: string, change: WatchChange): string {
  return `${bagVboId}:${change.key}:${change.from}:${change.to}`;
}
