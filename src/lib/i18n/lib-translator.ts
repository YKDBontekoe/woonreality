import domainNl from "../../../messages/nl/lib-domain.json";
import domainEn from "../../../messages/en/lib-domain.json";
import analysisNl from "../../../messages/nl/lib-analysis.json";
import analysisEn from "../../../messages/en/lib-analysis.json";
import financeNl from "../../../messages/nl/lib-finance.json";
import financeEn from "../../../messages/en/lib-finance.json";
import apiNl from "../../../messages/nl/lib-api.json";
import apiEn from "../../../messages/en/lib-api.json";
import type { Locale } from "./config";

/**
 * Library-layer translator bridge.
 *
 * All user-facing copy lives centrally in messages/{nl,en}/*.json. Library
 * modules cannot use next-intl hooks (they also run in route handlers and
 * node --test), so they resolve copy through this plain lookup instead.
 */
export type LibNamespace = "lib-domain" | "lib-analysis" | "lib-finance" | "lib-api";

export type LibTranslator = (key: string, params?: Record<string, unknown>) => string;

type Messages = Record<string, unknown>;

const catalogs: Record<Locale, Record<LibNamespace, Messages>> = {
  nl: { "lib-domain": domainNl, "lib-analysis": analysisNl, "lib-finance": financeNl, "lib-api": apiNl },
  en: { "lib-domain": domainEn, "lib-analysis": analysisEn, "lib-finance": financeEn, "lib-api": apiEn },
};

function lookup(messages: Messages, key: string): unknown {
  let current: unknown = messages;
  for (const part of key.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Messages)[part];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function getLibTranslator(locale: Locale, namespace: LibNamespace): LibTranslator {
  const primary = catalogs[locale][namespace];
  const fallback = locale === "nl" ? primary : catalogs.nl[namespace];
  return (key, params) => {
    const found = lookup(primary, key) ?? lookup(fallback, key);
    if (typeof found !== "string") return key;
    return interpolate(found, params);
  };
}
