"use client";

import { ArrowUpRight, FileCheck2, Leaf, LocateFixed, Map, ShieldCheck, SunMedium } from "lucide-react";
import { AddressSearch } from "@/components/address-search";
import { SiteHeader } from "@/components/site-header";

export function LandingPage() {
  return <main className="site-shell">
    <div className="container"><SiteHeader /></div>
    <section className="container hero">
      <div>
        <div className="eyebrow"><span className="eyebrow-dot" /> voor de werkelijkheid achter de advertentie</div>
        <h1>Weet waar je <em>écht</em> gaat wonen.</h1>
        <p className="hero-copy">Een woning vertelt wat er ín zit. WoonReality laat zien wat je tijdens een bezichtiging moeilijk ziet — met openbare data, duidelijke uitleg en altijd de bron erbij.</p>
        <AddressSearch />
        <div className="hero-note"><ShieldCheck size={15} /> Geen verborgen AI-score. Wel signalen die je kunt controleren.</div>
      </div>
      <div className="hero-visual" aria-label="Voorbeeld van een WoonReality analyse">
        <div className="visual-card"><div className="visual-map" /><div className="visual-top"><span className="visual-label">Live reality check</span><span className="visual-time">09:42 · BAG + BGT</span></div><div className="visual-building" /><div className="visual-pin"><MapPinIcon /></div><div className="visual-score"><div className="visual-score-label">Reality score</div><div className="visual-score-number">7,8<span>/ 10</span></div><div className="visual-score-meta">sterke basis, let op geluid</div></div></div>
        <div className="floating-tag"><span className="tag-icon"><Leaf size={15} /></span><span><strong>Groen 8,7</strong>binnen 250 m</span></div>
      </div>
    </section>
    <div className="container proof-strip" id="bronnen"><Proof icon={<LocateFixed size={17} />} title="Adresgericht" text="BAG als vaste woningidentiteit" /><Proof icon={<FileCheck2 size={17} />} title="Herleidbaar" text="Bron en caveat bij elk signaal" /><Proof icon={<Map size={17} />} title="Open data" text="Gebouwd op Nederlandse bronnen" /></div>
    <section className="container section" id="werkwijze"><div className="section-heading"><div className="eyebrow"><span className="eyebrow-dot" /> niet meer data, betere vragen</div><h2>De dingen die je pas merkt als je er woont.</h2><p>WoonReality vertaalt ruwe overheidsdata naar drie simpele lagen: wat zien we, waarom denken we dat, en wat kun je tijdens je bezichtiging checken?</p></div><div className="feature-grid"><Feature icon={<LocateFixed size={18} />} title="De plek" text="BAG, gebouw, groen en lokale topografie op het exacte woonadres." /><Feature icon={<SunMedium size={18} />} title="De leefomgeving" text="Van geluid en verstening tot wat er in de buurt kan veranderen." /><Feature icon={<ArrowUpRight size={18} />} title="De volgende stap" text="Geen stellige conclusie, maar een concrete tip voor je bezichtiging." /></div></section>
    <footer className="container footer"><span><strong>WoonReality</strong> · concept / MVP</span><span>Open data, menselijke uitleg.</span></footer>
  </main>;
}

function Proof({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="proof-item"><span className="proof-item-icon">{icon}</span><span><strong>{title}</strong><span>{text}</span></span></div>; }
function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="feature-card"><span className="feature-card-icon">{icon}</span><h3>{title}</h3><p>{text}</p></div>; }
function MapPinIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>; }
