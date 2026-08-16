export type ProfessionalGuide = {
  key: string;
  role: string;
  whatTheyDo: string;
  howToChoose: string[];
  registryLabel: string;
  registryUrl: string;
  stage: "finance_inspection" | "transfer";
};

/**
 * WoonReality does not scrape or aggregate a live directory of notarissen,
 * bouwkundig keurders or taxateurs (see docs/listing-data-strategy.md for
 * why we don't scrape portals in general, and because a curated "best of"
 * list would be an undisclosed recommendation, not a reality check).
 * Instead this gives buyers the same selection criteria an aankoopmakelaar
 * would use, plus the official, free-to-search registry for each
 * profession so they can vet candidates themselves.
 */
export const PROFESSIONAL_GUIDES: ProfessionalGuide[] = [
  {
    key: "taxateur",
    role: "Taxateur",
    whatTheyDo: "Bepaalt de marktwaarde voor je hypotheek. De bank leent op basis van de laagste van koopsom en taxatiewaarde.",
    howToChoose: [
      "Kies zelf, ook als de bank of makelaar er één voorstelt — je bent niet verplicht die te gebruiken.",
      "Moet in het NRVT-register staan (verplicht voor NHG en de meeste hypotheekverstrekkers).",
      "Vraag een vaste prijs vooraf en een levertijd; bel niet de taxateur van de verkopende makelaar.",
    ],
    registryLabel: "Zoek een NRVT-taxateur",
    registryUrl: "https://www.nrvt.nl/register/",
    stage: "finance_inspection",
  },
  {
    key: "keurder",
    role: "Bouwkundig keurder",
    whatTheyDo: "Beoordeelt de technische staat (dak, fundering, vocht, installaties) vóór je het keuringsvoorbehoud laat vervallen.",
    howToChoose: [
      "Kies een keurder die onafhankelijk is van de verkopende makelaar — geen gedeelde herkomstpremie of vaste doorverwijzing.",
      "Vraag of het rapport werkt met een puntensysteem/NEN 2767 of vergelijkbare, herleidbare normering.",
      "Loop zelf mee tijdens de keuring; een goed keurder legt ter plekke uit wat hij ziet.",
    ],
    registryLabel: "Vereniging Eigen Huis keuringen",
    registryUrl: "https://www.eigenhuis.nl/hypotheek-en-financien/bouwtechnische-keuring",
    stage: "finance_inspection",
  },
  {
    key: "notaris",
    role: "Notaris",
    whatTheyDo: "Stelt de leverings- en hypotheekakte op en verzorgt de overdracht. De koper kiest de notaris, niet de verkoper.",
    howToChoose: [
      "Vraag bij minimaal twee kantoren een vaste prijsopgave (all-in tarief) op vóór je kiest.",
      "Moet ingeschreven staan bij de KNB (Koninklijke Notariële Beroepsorganisatie).",
      "Vraag naar de conceptakte ruim vóór de passeerdatum, zodat je tijd hebt om vragen te stellen.",
    ],
    registryLabel: "Zoek een notaris (KNB)",
    registryUrl: "https://www.notaris.nl/notaris-zoeken",
    stage: "transfer",
  },
];

export function professionalGuidesForStage(stage: string): ProfessionalGuide[] {
  return PROFESSIONAL_GUIDES.filter((guide) => guide.stage === stage);
}
