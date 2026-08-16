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
};

export function apiUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}
