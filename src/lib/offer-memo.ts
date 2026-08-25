import { formatEuro } from "@/src/lib/purchase";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { formatLocaleTag } from "@/src/lib/format-locale";

/**
 * Bodmemo: a printable one-pager a buyer can hand to the verkopend makelaar.
 * Everything is composed from data the user already saw in the dashboard;
 * nothing here invents a valuation or predicts competition.
 */
export type OfferMemoInput = {
  addressLabel: string;
  postcodeCity: string;
  generatedAt: string;
  scenarioKey: "cautious" | "balanced" | "strong";
  scenarioLabel: string;
  bidAmount: number;
  askingPrice: number | null;
  financingCondition: boolean;
  inspectionCondition: boolean;
  buyerName?: string;
  budget?: number;
  ownFunds?: number;
  costsTotal?: number;
  ownFundsNeeded?: number;
  overallScore?: number;
  attentionPoints?: string[];
};

export type OfferMemoSection = {
  title: string;
  lines: string[];
};

export type OfferMemo = {
  title: string;
  subtitle: string;
  generatedAtLabel: string;
  bidAmountLabel: string;
  sections: OfferMemoSection[];
  disclaimer: string;
};

export function offerMemoConditions(
  input: Pick<OfferMemoInput, "financingCondition" | "inspectionCondition">,
  locale: Locale = "nl",
) {
  const t = getLibTranslator(locale, "lib-finance");
  return [
    input.financingCondition
      ? t("offerMemo.conditions.financingRequired")
      : t("offerMemo.conditions.financingWaived"),
    input.inspectionCondition
      ? t("offerMemo.conditions.inspectionRequired")
      : t("offerMemo.conditions.inspectionWaived"),
  ];
}

export function buildOfferMemo(input: OfferMemoInput, locale: Locale = "nl"): OfferMemo {
  const t = getLibTranslator(locale, "lib-finance");
  const intlTag = formatLocaleTag(locale);
  const conditions = offerMemoConditions(input, locale);
  const generatedAtLabel = new Intl.DateTimeFormat(intlTag, { dateStyle: "long" }).format(new Date(input.generatedAt));
  const euro = (value: number) => formatEuro(value, locale);
  const financialLines = [
    t("offerMemo.askingPriceLine", { value: input.askingPrice ? euro(input.askingPrice) : t("offerMemo.notProvided") }),
    t("offerMemo.bidLine", { amount: euro(input.bidAmount), scenario: input.scenarioLabel.toLowerCase() }),
  ];
  if (input.budget && input.budget > 0) financialLines.push(t("offerMemo.ownMaximumLine", { value: euro(input.budget) }));
  if (input.ownFunds != null && input.ownFunds > 0) financialLines.push(t("offerMemo.ownFundsAvailableLine", { value: euro(input.ownFunds) }));
  if (input.costsTotal != null && input.costsTotal > 0) financialLines.push(t("offerMemo.buyerCostsLine", { value: euro(input.costsTotal) }));
  if (input.ownFundsNeeded != null && input.ownFundsNeeded > 0) financialLines.push(t("offerMemo.ownFundsNeededLine", { value: euro(input.ownFundsNeeded) }));

  const attention = (input.attentionPoints ?? []).slice(0, 5);
  return {
    title: t("offerMemo.title"),
    subtitle: `${input.addressLabel} — ${input.postcodeCity}`,
    generatedAtLabel,
    bidAmountLabel: euro(input.bidAmount),
    sections: [
      {
        title: t("offerMemo.sections.offer"),
        lines: [
          t("offerMemo.offerLine", { amount: euro(input.bidAmount), address: input.addressLabel, date: generatedAtLabel }),
          t(`offerMemo.tone.${input.scenarioKey}`),
        ],
      },
      { title: t("offerMemo.sections.financials"), lines: financialLines },
      { title: t("offerMemo.sections.conditions"), lines: conditions },
      ...(attention.length
        ? [{
          title: t("offerMemo.sections.attention"),
          lines: [
            ...attention,
            t("offerMemo.attentionFooter"),
          ],
        }]
        : []),
      {
        title: t("offerMemo.sections.nextSteps"),
        lines: [
          t("offerMemo.nextStep1"),
          t("offerMemo.nextStep2"),
          t("offerMemo.nextStep3"),
        ],
      },
    ],
    disclaimer: t("offerMemo.disclaimer"),
  };
}

export function offerMemoMarkdown(memo: OfferMemo, locale: Locale = "nl") {
  const t = getLibTranslator(locale, "lib-finance");
  const blocks = [
    `# ${memo.title}: ${memo.subtitle}`,
    `_${t("offerMemo.composedOn", { date: memo.generatedAtLabel })}_`,
    "",
    t("offerMemo.bidMarkdown", { amount: memo.bidAmountLabel }),
    "",
    ...memo.sections.flatMap((section) => [`## ${section.title}`, ...section.lines.map((line) => `- ${line}`), ""]),
    "---",
    memo.disclaimer,
  ];
  return blocks.join("\n");
}

export function offerMemoFilename(addressLabel: string) {
  const slug = addressLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `bodmemo-${slug || "woning"}`;
}
