import { defaultLocale, normalizeLocale, type Locale } from "@/src/lib/i18n/config";

/** BCP 47 tags used for Intl formatting, keyed by app locale. */
const BCP47_TAGS: Record<Locale, string> = {
  nl: "nl-NL",
  en: "en-GB",
};

export function formatLocaleTag(locale: unknown): string {
  return BCP47_TAGS[normalizeLocale(locale)] ?? BCP47_TAGS[defaultLocale];
}

export function formatDate(value: Date | string | number, locale: unknown): string {
  return new Date(value).toLocaleDateString(formatLocaleTag(locale), { dateStyle: "long" });
}

export function formatDateTime(value: Date | string | number, locale: unknown): string {
  return new Date(value).toLocaleString(formatLocaleTag(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
