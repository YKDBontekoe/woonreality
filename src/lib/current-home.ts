import { isValidBagId } from "@/src/lib/validation/workspace";
import type { SavedProperty } from "@/src/lib/types";

/**
 * De huidige woning staat als record in preferences_json.currentHome.
 * Corrupte of handmatig aangepaste waarden mogen de workspace nooit breken:
 * dan geldt "geen huidige woning".
 */
export function parseCurrentHome(value: unknown): SavedProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.bagVboId !== "string" || !isValidBagId(record.bagVboId)) return null;
  if (typeof record.addressLabel !== "string" || !record.addressLabel.trim()) return null;
  return {
    bagVboId: record.bagVboId,
    addressLabel: record.addressLabel,
    city: typeof record.city === "string" ? record.city : "",
    postcode: typeof record.postcode === "string" ? record.postcode : "",
    savedAt: typeof record.savedAt === "string" ? record.savedAt : new Date(0).toISOString(),
    askingPrice: typeof record.askingPrice === "number" && Number.isFinite(record.askingPrice) && record.askingPrice > 0 ? record.askingPrice : null,
  };
}

/** Verschil ten opzichte van de baseline, op één decimaal om negatieve-null ruis te vermijden. */
export function scoreDelta(baselineScore: number, score: number): number {
  return Math.round((score - baselineScore) * 10) / 10;
}
