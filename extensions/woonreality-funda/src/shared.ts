export const DEFAULT_API_BASE = "https://woonreality.vercel.app";

export type CaptureEnvelope = {
  sourceUrl: string;
  capturedAt: string;
  parserVersion: number;
  facts: Record<string, unknown> & { notes?: string[] };
};

export type LastSave = {
  bagVboId: string;
  url: string;
  at: string;
  askingPrice?: number;
  captureQuality?: "full" | "partial" | "sparse";
};

export const CAPTURE_QUALITY_LABELS: Record<string, string> = {
  full: "Alle belangrijke kenmerken bewaard",
  partial: "Enkele kenmerken bewaard",
  sparse: "Nog te weinig kenmerken — open de volledige advertentie en bewaar opnieuw",
};

export function apiUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}
