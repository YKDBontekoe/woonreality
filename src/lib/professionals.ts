import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

export type ProfessionalGuide = {
  key: string;
  role: string;
  whatTheyDo: string;
  howToChoose: string[];
  /** Official registry search when one exists; omit rather than linking a commercial provider. */
  registryLabel?: string;
  registryUrl?: string;
  stage: "finance_inspection" | "transfer";
};

/**
 * WoonReality does not scrape or aggregate a live directory of notarissen,
 * bouwkundig keurders or taxateurs (see docs/listing-data-strategy.md for
 * why we don't scrape portals in general, and because a curated "best of"
 * list would be an undisclosed recommendation, not a reality check).
 * Instead this gives buyers the same selection criteria an aankoopmakelaar
 * would use, plus the official, free-to-search registry for each profession
 * when one exists.
 */
const GUIDE_SKELETONS: Array<{
  key: "taxateur" | "keurder" | "notaris";
  choices: number;
  registryUrl?: string;
  stage: ProfessionalGuide["stage"];
}> = [
  { key: "taxateur", choices: 3, registryUrl: "https://www.nrvt.nl/register/", stage: "finance_inspection" },
  { key: "keurder", choices: 4, stage: "finance_inspection" },
  { key: "notaris", choices: 3, registryUrl: "https://www.notaris.nl/notaris-zoeken", stage: "transfer" },
];

export function professionalGuides(locale: Locale = "nl"): ProfessionalGuide[] {
  const t = getLibTranslator(locale, "lib-domain");
  return GUIDE_SKELETONS.map(({ key, choices, registryUrl, stage }) => ({
    key,
    role: t(`professionals.${key}.role`),
    whatTheyDo: t(`professionals.${key}.whatTheyDo`),
    howToChoose: Array.from({ length: choices }, (_, index) => t(`professionals.${key}.howToChoose.${index}`)),
    ...(registryUrl ? { registryLabel: t(`professionals.${key}.registryLabel`), registryUrl } : {}),
    stage,
  }));
}

/** @deprecated Dutch snapshot for legacy callers without a Locale; prefer professionalGuides(locale). */
export const PROFESSIONAL_GUIDES: ProfessionalGuide[] = professionalGuides();

export function professionalGuidesForStage(stage: string, locale: Locale = "nl"): ProfessionalGuide[] {
  return professionalGuides(locale).filter((guide) => guide.stage === stage);
}
