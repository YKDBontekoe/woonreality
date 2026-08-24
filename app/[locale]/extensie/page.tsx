import { Puzzle } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/src/lib/i18n/navigation";
import { ExtensionSetup } from "@/components/extension-setup";
import { ListingHistoryFromWorkspace } from "@/components/listing-history";
import { PageShell } from "@/components/ui/page-shell";
import { getLatestExtensionRelease } from "@/src/lib/extension-release";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "extensie" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
  };
}

export const dynamic = "force-dynamic";

export default async function ExtensiePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("extensie");
  const release = await getLatestExtensionRelease();
  const chromeUrl = release?.chromeDownloadUrl ?? "/extension/woonreality-funda-chrome.zip";
  const firefoxUrl = release?.firefoxDownloadUrl ?? "/extension/woonreality-funda-firefox.xpi";

  return (
    <PageShell current="extensie" className="extension-shell">
      <div className="extension-page">
        <header className="extension-intro">
          <Link className="back-link" href="/#zoek-adres">{t("page.backToSearch")}</Link>
          <div className="eyebrow"><Puzzle size={13} /> {t("page.eyebrow")}</div>
          <h1>{t("page.title")}</h1>
          <p className="hero-copy">
            {t("page.heroCopy")}
          </p>
        </header>

        <div className="extension-content">

      <section className="listing-intake-card">
        <div className="section-kicker">{t("page.stepOne")}</div>
        <h2>{t("page.chromeEdge")} {release && <small>{t("page.versionSuffix", { version: release.version })}</small>}</h2>
        <ol className="extension-steps">
          <li>
            <a className="primary-button extension-download-button" href={chromeUrl} download>
              {t("page.downloadChrome")}
            </a>
            <span>woonreality-funda-chrome.zip</span>
          </li>
          <li>{t("page.extractArchive")}</li>
          <li>{t("page.devModePart1")} <code>chrome://extensions</code> {t("page.devModePart2")} <code>edge://extensions</code>{t("page.devModePart3")}</li>
          <li>{t("page.loadUnpacked")}</li>
        </ol>
        <p>{t("page.updateNote")}</p>
      </section>

      <section className="listing-intake-card">
        <div className="section-kicker">{t("page.stepOne")}</div>
        <h2>Firefox</h2>
        <ol className="extension-steps">
          <li>
            <a className="primary-button extension-download-button" href={firefoxUrl} download>
              {t("page.downloadFirefox")}
            </a>
            <span>woonreality-funda-firefox.xpi</span>
          </li>
          <li>{t("page.firefoxDevPart1")} <code>about:debugging#/runtime/this-firefox</code> {t("page.firefoxDevPart2")} <code>manifest.json</code>.</li>
          <li>{t("page.tempAddonNote")}</li>
        </ol>
      </section>

      <section className="extension-connect-card">
        <div className="section-kicker">{t("page.stepTwo")}</div>
        <h2>{t("page.connectHeading")}</h2>
        <ExtensionSetup />
      </section>

      <section className="cockpit-section extension-history" id="funda-geschiedenis">
        <ListingHistoryFromWorkspace compact />
      </section>
        </div>
      </div>
    </PageShell>
  );
}
