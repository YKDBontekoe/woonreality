import Link from "next/link";
import { Puzzle } from "lucide-react";
import { ExtensionSetup } from "@/components/extension-setup";
import { ListingHistoryFromWorkspace } from "@/components/listing-history";
import { PageShell } from "@/components/ui/page-shell";
import { getLatestExtensionRelease } from "@/src/lib/extension-release";

export const metadata = {
  title: "Funda-extensie — WoonReality",
  description: "Installeer de WoonReality-extensie voor Chrome, Edge of Firefox en bewaar Funda-kenmerken in je dossier.",
};

export const dynamic = "force-dynamic";

export default async function ExtensiePage() {
  const release = await getLatestExtensionRelease();
  const chromeUrl = release?.chromeDownloadUrl ?? "/extension/woonreality-funda-chrome.zip";
  const firefoxUrl = release?.firefoxDownloadUrl ?? "/extension/woonreality-funda-firefox.xpi";

  return (
    <PageShell current="extensie" className="extension-shell">
      <div className="extension-page">
        <header className="extension-intro">
          <Link className="back-link" href="/#zoek-adres">← Adres zoeken</Link>
          <div className="eyebrow"><Puzzle size={13} /> browser-extensie</div>
          <h1>Bewaar Funda-feiten bij je woning.</h1>
          <p className="hero-copy">
            Installeer de extensie één keer. Open daarna een Funda-advertentie in je eigen browser en bewaar alleen de relevante kenmerken bij je woningcheck.
          </p>
        </header>

        <div className="extension-content">

      <section className="listing-intake-card">
        <div className="section-kicker">Stap 1</div>
        <h2>Chrome of Edge {release && <small>· versie {release.version}</small>}</h2>
        <ol className="extension-steps">
          <li>
            <a className="primary-button extension-download-button" href={chromeUrl} download>
              Download voor Chrome / Edge (.zip)
            </a>
            <span>woonreality-funda-chrome.zip</span>
          </li>
          <li>Pak het archief uit in een map die je bewaart.</li>
          <li>Ga naar <code>chrome://extensions</code> (of <code>edge://extensions</code>) en zet ontwikkelaarsmodus aan.</li>
          <li>Kies “Uitgepakte extensie laden” en selecteer die map.</li>
        </ol>
        <p>Bij een nieuwe versie download je de zip opnieuw en kies je “Vernieuwen” op de extensiepagina.</p>
      </section>

      <section className="listing-intake-card">
        <div className="section-kicker">Stap 1</div>
        <h2>Firefox</h2>
        <ol className="extension-steps">
          <li>
            <a className="primary-button extension-download-button" href={firefoxUrl} download>
              Download voor Firefox (.xpi)
            </a>
            <span>woonreality-funda-firefox.xpi</span>
          </li>
          <li>Voor ontwikkeling: <code>about:debugging#/runtime/this-firefox</code> → “Tijdelijke add-on laden” en kies het XPI of <code>manifest.json</code>.</li>
          <li>Tijdelijke add-ons verdwijnen na een herstart. Een ondertekende XPI of AMO-publicatie blijft staan.</li>
        </ol>
      </section>

      <section className="extension-connect-card">
        <div className="section-kicker">Stap 2</div>
        <h2>Koppel deze browser</h2>
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
