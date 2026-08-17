import { listingKenmerkGroups, neighborhoodStatsFromListing } from "@/src/lib/listing-kenmerken";
import { listingRiskFlags } from "@/src/lib/listing-risk";
import { formatEuro } from "@/src/lib/purchase";
import { isHttpsUrl } from "@/src/lib/listing-intake";
import type { PropertyListing } from "@/src/lib/types";

export function ListingKenmerkenGrid({ listing }: { listing: PropertyListing }) {
  const groups = listingKenmerkGroups(listing);
  const buurt = neighborhoodStatsFromListing(listing);
  const risks = listingRiskFlags(listing);
  const maxPrice = Math.max(listing.pricePerM2 ?? 0, buurt.avgPricePerM2 ?? 0, 1);
  const sourceOpen = isHttpsUrl(listing.sourceUrl);

  return (
    <section className="kenmerk-section" id="advertentie">
      <div className="section-inline-heading">
        <div>
          <div className="section-kicker">Advertentie</div>
          <h2>Alle kenmerken</h2>
        </div>
        {sourceOpen && listing.sourceUrl && (
          <a className="text-link" href={listing.sourceUrl} target="_blank" rel="noreferrer">Open Funda</a>
        )}
      </div>
      {risks.length > 0 && (
        <ul className="dash-risk-pills">
          {risks.map((flag) => (
            <li className={`severity-${flag.severity}`} key={flag.key}>{flag.title}</li>
          ))}
        </ul>
      )}
      <div className="kenmerk-grid kenmerk-groups">
        {groups.map((group) => (
          <article className="kenmerk-group" key={group.key}>
            <h3>{group.label}</h3>
            <dl>
              {group.rows.map((row) => (
                <div key={`${group.key}-${row.label}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      {(buurt.avgPricePerM2 || buurt.inhabitants || buurt.familySharePct != null) && (
        <div className="dash-buurt">
          <div className="section-kicker">Funda-buurt</div>
          {listing.pricePerM2 != null && buurt.avgPricePerM2 != null && (
            <div className="dash-buurt-bars">
              <div>
                <span>Dit huis</span>
                <i style={{ width: `${Math.round((listing.pricePerM2 / maxPrice) * 100)}%` }} />
                <strong>{formatEuro(listing.pricePerM2)} / m²</strong>
              </div>
              <div>
                <span>Buurt</span>
                <i style={{ width: `${Math.round((buurt.avgPricePerM2 / maxPrice) * 100)}%` }} />
                <strong>{formatEuro(buurt.avgPricePerM2)} / m²</strong>
              </div>
            </div>
          )}
          <div className="dash-buurt-meta">
            {buurt.inhabitants != null && <span>{buurt.inhabitants.toLocaleString("nl-NL")} inwoners</span>}
            {buurt.familySharePct != null && <span>{buurt.familySharePct.toLocaleString("nl-NL")}% gezin</span>}
          </div>
        </div>
      )}
    </section>
  );
}
