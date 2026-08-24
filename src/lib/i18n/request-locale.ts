import { normalizeLocale, type Locale } from "./config";

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * Resolve the locale for a route handler request.
 *
 * Priority: explicit `?lang=` query param, then the `NEXT_LOCALE` cookie that
 * next-intl persists on locale-prefixed page visits, then the Accept-Language
 * header, then the default (Dutch).
 */
export function getLocaleFromRequest(request: Request): Locale {
  const url = new URL(request.url);
  const param = url.searchParams.get("lang");
  if (param) return normalizeLocale(param.toLowerCase().slice(0, 2));

  const cookie = cookieValue(request.headers.get("cookie"), "NEXT_LOCALE");
  if (cookie) return normalizeLocale(cookie);

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const tag = part.trim().split(";")[0]?.toLowerCase();
      if (!tag) continue;
      if (tag.startsWith("nl")) return "nl";
      if (tag.startsWith("en")) return "en";
    }
  }

  return normalizeLocale(undefined);
}
