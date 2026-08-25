import { useTranslations } from "next-intl";
import { Link } from "@/src/lib/i18n/navigation";

export function SiteFooter() {
  const t = useTranslations("footer");
  const th = useTranslations("header");
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <div className="site-footer-brand">
          <strong>WoonReality</strong>
          <p>{t("tagline")}</p>
        </div>
        <nav className="site-footer-nav" aria-label={t("navAria")}>
          <Link href="/hypotheek">{th("hypotheek")}</Link>
          <Link href="/kaart">{th("kaart")}</Link>
          <Link href="/vergelijken">{th("vergelijken")}</Link>
          <Link href="/extensie">{th("extensie")}</Link>
          <Link href="/mijn-aankoop">{th("mijnAankoop")}</Link>
        </nav>
        <small>{t("disclaimer")}</small>
      </div>
    </footer>
  );
}
