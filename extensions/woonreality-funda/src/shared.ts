export const DEFAULT_API_BASE = "https://woonreality.vercel.app";
export const UPDATE_ALARM = "woonreality-extension-update";

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

export function isNewerExtensionVersion(remote: string, local: string) {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(remote);
  const b = parse(local);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) > (b[index] ?? 0)) return true;
    if ((a[index] ?? 0) < (b[index] ?? 0)) return false;
  }
  return false;
}

export function apiUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}${path}`;
}
