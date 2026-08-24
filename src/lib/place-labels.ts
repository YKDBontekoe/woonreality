import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type { PlaceKind } from "@/src/lib/types";

const PLACE_KINDS: PlaceKind[] = ["woonplaats", "gemeente", "buurt"];

export function placeKindLabel(kind: PlaceKind, locale: Locale = "nl"): string {
  return getLibTranslator(locale, "lib-domain")(`placeLabels.kinds.${kind}`);
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer placeKindLabel(kind, locale). */
export const placeKindLabels: Record<PlaceKind, string> = Object.fromEntries(
  PLACE_KINDS.map((kind) => [kind, placeKindLabel(kind)]),
) as Record<PlaceKind, string>;
