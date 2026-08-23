export function clamp(value: number, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Nearest multiple of `step`, used to avoid implying spurious measurement precision ("120 m", not "117.4 m"). */
export function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step;
}
