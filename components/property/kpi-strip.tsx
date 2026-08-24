import { useTranslations } from "next-intl";
import type { Analysis, PropertyListing } from "@/src/lib/types";
import { formatEuro } from "@/src/lib/purchase";

const ENERGY_TRACK = ["A", "B", "C", "D", "E", "F", "G"];

function energyPin(label?: string) {
  if (!label) return null;
  const letter = label.trim().toUpperCase().replace(/[^A-G].*$/, "");
  return ENERGY_TRACK.includes(letter) ? letter : null;
}

export function PropertyKpiStrip({
  analysis,
  listing,
  variant = "full",
}: {
  analysis: Analysis;
  listing: PropertyListing | null;
  variant?: "compact" | "full";
}) {
  const t = useTranslations("woning");
  const label = listing?.energyLabel;
  const pin = energyPin(label);
  const kpis = [
    {
      key: "score",
      label: t("kpi.score"),
      value: analysis.overallScore.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      hint: "/ 10",
      compact: false,
    },
    {
      key: "price",
      label: t("kpi.askingPrice"),
      value: listing?.askingPrice != null ? formatEuro(listing.askingPrice) : "—",
      hint: listing?.status === "active" ? t("kpi.forSale") : listing?.provider,
      compact: true,
    },
    {
      key: "area",
      label: t("kpi.living"),
      value: listing?.livingAreaM2 != null ? `${listing.livingAreaM2} m²` : "—",
      hint: listing?.plotAreaM2 != null ? t("kpi.plotHint", { area: listing.plotAreaM2 }) : undefined,
      compact: true,
    },
    {
      key: "year",
      label: t("kpi.buildYear"),
      value: listing?.constructionYear != null ? String(listing.constructionYear) : "—",
      hint: listing?.propertyType?.split(",")[0],
      compact: true,
    },
    {
      key: "rooms",
      label: t("kpi.rooms"),
      value: listing?.roomCount != null && listing?.bedroomCount != null
        ? `${listing.roomCount} / ${listing.bedroomCount}`
        : listing?.roomCount != null
          ? String(listing.roomCount)
          : "—",
      hint: listing?.bedroomCount != null ? t("kpi.roomsHint") : undefined,
      compact: false,
    },
    {
      key: "m2",
      label: "€ / m²",
      value: listing?.pricePerM2 != null ? formatEuro(listing.pricePerM2) : "—",
      hint: listing?.livingAreaM2 != null ? `${listing.livingAreaM2} m²` : undefined,
      compact: false,
    },
  ];

  const visible = variant === "compact" ? kpis.filter((kpi) => kpi.compact) : kpis;
  if (variant === "compact" && !label && visible.every((kpi) => kpi.value === "—")) return null;

  return (
    <section className={`dash-kpis ${variant === "compact" ? "is-compact" : ""}`} aria-label={t("kpi.keyFiguresAria")}>
      {visible.map((kpi) => (
        <div className="dash-kpi" key={kpi.key}>
          <small>{kpi.label}</small>
          <strong>{kpi.value}</strong>
          {kpi.hint ? <span>{kpi.hint}</span> : null}
        </div>
      ))}
      {variant === "full" && (
        <div className="dash-kpi dash-kpi-energy">
          <small>{t("kpi.energyShort")}</small>
          <strong>{label ?? "—"}</strong>
          <div className="energy-track" aria-hidden="true">
            {ENERGY_TRACK.map((letter) => (
              <i className={pin === letter ? "is-on" : ""} key={letter}>{letter}</i>
            ))}
          </div>
        </div>
      )}
      {variant === "compact" && (
        <div className="dash-kpi dash-kpi-energy">
          <small>{t("kpi.energyShort")}</small>
          <strong>{label ?? "—"}</strong>
        </div>
      )}
    </section>
  );
}
