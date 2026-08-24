import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/ui/page-shell";
import { AddressSearch } from "@/components/address-search";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <PageShell>
      <section className="notfound" aria-labelledby="notfound-title">
        <p className="eyebrow">404</p>
        <h1 id="notfound-title">{t("notFoundTitle")}</h1>
        <p className="notfound-copy">
          {t("notFoundCopy")}
        </p>
        <div className="notfound-actions">
          <Button variant="primary" href="/">{t("home")}</Button>
        </div>
        <AddressSearch id="zoek-adres-notfound" />
      </section>
    </PageShell>
  );
}
