const rtf = new Intl.RelativeTimeFormat("nl-NL", { numeric: "auto" });

/**
 * "3 dagen geleden" reads faster than a full locale date for freshness
 * signals. Falls back to an absolute date older than two months.
 */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const diffSeconds = Math.round((then - now) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  if (absSeconds < 60) return rtf.format(Math.round(diffSeconds), "second");
  if (absSeconds < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (absSeconds < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (absSeconds < 60 * 86400) return rtf.format(Math.round(diffSeconds / 86400), "day");
  return new Date(iso).toLocaleDateString("nl-NL", { dateStyle: "long" });
}
