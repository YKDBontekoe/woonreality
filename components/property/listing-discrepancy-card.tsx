import { AlertTriangle, Check, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ListingDiscrepancy } from "@/src/lib/listing-compare";
import { formatEuro } from "@/src/lib/purchase";

type DiscrepancyInput = Omit<ListingDiscrepancy, "key"> & { key: string };

function formatValue(key: string, value: number | string | null) {
  if (value == null || value === "") return "—";
  if (key === "askingVsWoz" || key === "pricePerM2") {
    return typeof value === "number"
      ? key === "pricePerM2" ? `€ ${value.toLocaleString("nl-NL")} /m²` : formatEuro(value)
      : String(value);
  }
  if (key === "livingArea") return typeof value === "number" ? `${value} m²` : String(value);
  return String(value);
}

export function ListingDiscrepancyCard({ items }: { items: DiscrepancyInput[] }) {
  const t = useTranslations("woning");
  if (!items.length) return null;
  const mismatches = items.filter((item) => item.severity === "mismatch");
  const attention = items.filter((item) => item.severity === "attention");

  return (
    <section className="dash-points listing-discrepancy-card" aria-label={t("compare.aria")}>
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow"><Scale size={13} /> {t("compare.kicker")}</div>
          <h2>{t("compare.title")}</h2>
          <p>{t("compare.copy")}</p>
        </div>
        {(mismatches.length + attention.length) > 0 && <span className="coverage-pill">{mismatches.length + attention.length}× {t("compare.foundCount")}</span>}
      </div>
      <ul className="discrepancy-list">
        {items.map((item) => (
          <li className={`is-${item.severity}`} key={`${item.key}-${item.listingValue}-${item.officialValue}`}>
            {item.severity === "match"
              ? <Check size={14} />
              : <AlertTriangle size={14} />}
            <div>
              <strong>{t(`compare.items.${item.key}`)}</strong>
              <span>
                {t("compare.advert")}: {formatValue(item.key, item.listingValue)}
                {" · "}
                {t("compare.official")}: {formatValue(item.key, item.officialValue)}
              </span>
            </div>
            {item.severity !== "match" && <em>{item.severity === "mismatch" ? t("compare.mismatchLabel") : t("compare.attentionLabel")}</em>}
          </li>
        ))}
      </ul>
      {(mismatches.length > 0 || attention.length > 0) && (
        <p className="muted-copy">{t("compare.disclaimer")}</p>
      )}
    </section>
  );
}
