import { formatEuro } from "@/src/lib/purchase";

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

const SCENARIO_TONE: Record<OfferMemoInput["scenarioKey"], string> = {
  cautious: "Voorzichtig bod met beide voorwaarden; ruimte om te verhogen als er nieuwe informatie is.",
  balanced: "Reëel bod dat past bij wat de openbare check laat zien.",
  strong: "Serieuze intentie; beperkt aantal voorwaarden, mits documenten dit ondersteunen.",
};

export function offerMemoConditions(input: Pick<OfferMemoInput, "financingCondition" | "inspectionCondition">) {
  return [
    input.financingCondition
      ? "Financieringsvoorbehoud van toepassing."
      : "Geen financieringsvoorbehoud; financiering staat (bijna) rond. Bankgarantie/waarborgsom wordt direct aangeboden.",
    input.inspectionCondition
      ? "Voorbehoud bouwkundige keuring (verslag volgt binnen de afgesproken termijn)."
      : "Geen bouwkundig voorbehoud; recente keuringsrapportage kan worden overlegd.",
  ];
}

export function buildOfferMemo(input: OfferMemoInput): OfferMemo {
  const conditions = offerMemoConditions(input);
  const generatedAtLabel = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(input.generatedAt));
  const financialLines = [
    `Vraagprijs: ${input.askingPrice ? formatEuro(input.askingPrice) : "niet opgegeven"}.`,
    `Bod: ${formatEuro(input.bidAmount)} (${input.scenarioLabel.toLowerCase()}).`,
  ];
  if (input.budget && input.budget > 0) financialLines.push(`Eigen maximum: ${formatEuro(input.budget)}.`);
  if (input.ownFunds != null && input.ownFunds > 0) financialLines.push(`Eigen geld beschikbaar: ${formatEuro(input.ownFunds)}.`);
  if (input.costsTotal != null && input.costsTotal > 0) financialLines.push(`Kosten koper (indicatie): ${formatEuro(input.costsTotal)}.`);
  if (input.ownFundsNeeded != null && input.ownFundsNeeded > 0) financialLines.push(`Totaal benodigd eigen geld bij deze koopsom (indicatie): ${formatEuro(input.ownFundsNeeded)}.`);

  const attention = (input.attentionPoints ?? []).slice(0, 5);
  return {
    title: "Bodmemo",
    subtitle: `${input.addressLabel} — ${input.postcodeCity}`,
    generatedAtLabel,
    bidAmountLabel: formatEuro(input.bidAmount),
    sections: [
      {
        title: "Dit bod",
        lines: [
          `${formatEuro(input.bidAmount)} voor de woning op ${input.addressLabel}, opgesteld op ${generatedAtLabel}.`,
          SCENARIO_TONE[input.scenarioKey],
        ],
      },
      { title: "Financiële onderbouwing", lines: financialLines },
      { title: "Voorwaarden", lines: conditions },
      ...(attention.length
        ? [{
          title: "Aandachtspunten uit openbare data",
          lines: [
            ...attention,
            "Deze punten komen uit openbare bronnen en zijn geen bouwkundig oordeel; een eigen keuring blijft nodig.",
          ],
        }]
        : []),
      {
        title: "Volgende stappen",
        lines: [
          "Bij akkoord ontvangt u graag zo snel mogelijk het concept-koopakkoord.",
          "Bankgarantie of waarborgsom wordt binnen 2 werkdagen na mondeling akkoord geregeld.",
          "Notaris en taxateur zijn al aangenomen voor deze woning.",
        ],
      },
    ],
    disclaimer:
      "Deze memo is door de koper zelf opgesteld met WoonReality en is geen advies, taxatie of garantie. Openbare data vervangt geen keuring, notaris of hypotheekadvies.",
  };
}

export function offerMemoMarkdown(memo: OfferMemo) {
  const blocks = [
    `# ${memo.title}: ${memo.subtitle}`,
    `_Opgesteld op ${memo.generatedAtLabel}_`,
    "",
    `**Bod: ${memo.bidAmountLabel}**`,
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
