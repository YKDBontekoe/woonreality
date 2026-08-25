import { useLocale, useTranslations } from "next-intl";
import { isFundaListingUrl } from "@/src/lib/listing-import";
import { isHttpsUrl } from "@/src/lib/listing-intake";
import { listingRiskFlags } from "@/src/lib/listing-risk";
import { formatDate as formatLocaleDate } from "@/src/lib/format-locale";
import { formatEuro } from "@/src/lib/purchase";
import type { PropertyListing } from "@/src/lib/types";

function formatDate(value: string | undefined, locale: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return formatLocaleDate(value, locale);
}

function sourceIsOpenable(url: string) {
  if (!isHttpsUrl(url)) return false;
  if (isFundaListingUrl(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.pathname !== "/" || Boolean(parsed.search);
  } catch {
    return false;
  }
}

export function ListingFactsCard({
  listing,
  status,
  eyebrow,
  title,
  description,
  id = "advertentie",
}: {
  listing: PropertyListing | null;
  status: "loading" | "available" | "unavailable";
  eyebrow?: string;
  title?: string;
  description?: string;
  id?: string;
}) {
  const t = useTranslations("woning");
  const locale = useLocale();
  const resolvedEyebrow = eyebrow ?? t("factsCard.eyebrowDefault");
  const resolvedTitle = title ?? t("factsCard.titleDefault");
  const resolvedDescription = description ?? t("factsCard.descriptionDefault");
  if (status === "loading" || !listing) return null;

  const facts = [
    [t("factsCard.facts.livingArea"), listing.livingAreaM2 != null ? `${listing.livingAreaM2} m²` : undefined],
    [t("factsCard.facts.plot"), listing.plotAreaM2 != null ? `${listing.plotAreaM2} m²` : undefined],
    [t("factsCard.facts.volume"), listing.volumeM3 != null ? `${listing.volumeM3} m³` : undefined],
    [t("factsCard.facts.rooms"), listing.roomCount],
    [t("factsCard.facts.bedrooms"), listing.bedroomCount],
    [t("factsCard.facts.bathrooms"), listing.bathroomCount],
    [t("factsCard.facts.type"), listing.propertyType],
    [t("factsCard.facts.yearBuilt"), listing.constructionYear],
    [t("factsCard.facts.energyLabel"), listing.energyLabel],
    [t("factsCard.facts.insulation"), listing.insulation],
    [t("factsCard.facts.heating"), listing.heating],
    [t("factsCard.facts.glazing"), listing.glazing],
    [t("factsCard.facts.solarPanels"), listing.solarPanelCount],
    [t("factsCard.facts.outdoorSpace"), listing.outdoorSpaceM2 != null ? `${listing.outdoorSpaceM2} m²` : undefined],
    [t("factsCard.facts.gardenOrientation"), listing.gardenOrientation],
    [t("factsCard.facts.balcony"), listing.balcony == null ? undefined : listing.balcony ? t("factsCard.yes") : t("factsCard.no")],
    [t("factsCard.facts.terrace"), listing.terrace == null ? undefined : listing.terrace ? t("factsCard.yes") : t("factsCard.no")],
    [t("factsCard.facts.parking"), listing.parking],
    [t("factsCard.facts.storage"), listing.storage],
    [t("factsCard.facts.vveContribution"), listing.vveContribution != null ? formatEuro(listing.vveContribution) : undefined],
    [t("factsCard.facts.vveReserve"), listing.vveReserveFund != null ? formatEuro(listing.vveReserveFund) : undefined],
    [t("factsCard.facts.ownership"), listing.ownership],
    [t("factsCard.facts.neighborhood"), listing.neighborhood],
  ].filter(([, value]) => value !== undefined && value !== "—") as [string, string | number][];

  const riskFlags = listingRiskFlags(listing);

  const shownLabels = new Set(facts.map(([label]) => label.toLowerCase()));
  const extraKenmerken = Object.entries(listing.extraKenmerken ?? {}).filter(([label]) => {
    const key = label.toLowerCase();
    return !shownLabels.has(key) && !/woonoppervlak|^wonen$|perceel|aantal kamers|slaapkamer|energielabel|bouwjaar|vraagprijs/.test(key);
  });

  return (
    <section className="listing-section" id={id}>
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" /> {resolvedEyebrow}
          </div>
          <h2>{resolvedTitle}</h2>
          <p>{resolvedDescription}</p>
        </div>
        <span className="coverage-pill">{t(`factsCard.status.${listing.status}`)}</span>
      </div>
      <div className="listing-card">
        <div className="listing-price-row">
          <div>
            <span className="listing-label">{t("factsCard.askingPrice")}</span>
            <strong>{formatEuro(listing.askingPrice)}</strong>
            {listing.pricePerM2 != null && (
              <small>{formatEuro(listing.pricePerM2)} {t("factsCard.perM2")}</small>
            )}
          </div>
          <div className="listing-price-history">
            {listing.originalAskingPrice != null && (
              <span>{t("factsCard.originalPrice", { amount: formatEuro(listing.originalAskingPrice) })}</span>
            )}
            {listing.priceChangeAmount != null && (
              <span>
                {t("factsCard.priceChange", { amount: formatEuro(listing.priceChangeAmount) })}
                {listing.priceChangePct != null ? ` (${listing.priceChangePct.toLocaleString("nl-NL")}%)` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="listing-meta">
          <span>{t("factsCard.publishedAt", { date: formatDate(listing.firstPublishedAt, locale) })}</span>
          <span>{t("factsCard.updatedAt", { date: formatDate(listing.fetchedAt, locale) })}</span>
          {listing.offerDeadline && <span>{t("factsCard.offerDeadlineUntil", { date: formatDate(listing.offerDeadline, locale) })}</span>}
        </div>
        {riskFlags.length > 0 && (
          <div className="listing-risk-flags">
            <span className="listing-label">{t("factsCard.riskHeading")}</span>
            <ul>
              {riskFlags.map((flag) => (
                <li key={flag.key} className={`listing-risk-flag severity-${flag.severity}`}>
                  <strong>{flag.title}</strong>
                  <p>{flag.summary}</p>
                  <p className="listing-risk-action">{flag.action}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {facts.length > 0 && (
          <div className="listing-fact-grid">
            {facts.slice(0, 12).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        )}
        {(extraKenmerken.length > 0 || facts.length > 12 || listing.description || listing.textSections?.length) ? (
          <details className="listing-more">
            <summary>{t("factsCard.moreDetails")}</summary>
            {facts.length > 12 && (
              <div className="listing-fact-grid listing-fact-grid-rest">
                {facts.slice(12).map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
            {extraKenmerken.length > 0 && (
              <div className="listing-extra-kenmerken">
                {extraKenmerken.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
            {listing.description && (
              <div className="listing-description">
                <span className="listing-label">{t("factsCard.descriptionLabel")}</span>
                <p>{listing.description}</p>
              </div>
            )}
            {listing.textSections?.filter((section) => section.text !== listing.description).map((section) => (
              <div className="listing-description" key={section.title}>
                <span className="listing-label">{section.title}</span>
                <p>{section.text}</p>
              </div>
            ))}
          </details>
        ) : null}
        {listing.notes?.length ? (
          <ul className="listing-notes">
            {listing.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        ) : null}
        <div className="listing-footer">
          <span>
            {t("factsCard.sourceFetched", { provider: listing.provider, date: formatDate(listing.fetchedAt, locale) })}
          </span>
          {sourceIsOpenable(listing.sourceUrl) && (
            <a href={listing.sourceUrl} target="_blank" rel="noreferrer">{t("factsCard.openSource")}</a>
          )}
        </div>
      </div>
    </section>
  );
}
