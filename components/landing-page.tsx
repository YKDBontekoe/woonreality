"use client";

import { ArrowUpRight, FileCheck2, Landmark, Leaf, LocateFixed, Map, ShieldCheck, SunMedium } from "lucide-react";
import { AddressSearch } from "@/components/address-search";
import { ListingIntake } from "@/components/listing-intake";
import { SiteHeader } from "@/components/site-header";

export function LandingPage() {
  return <main className="site-shell">
    <div className="container"><SiteHeader current="home" /></div>
    <section className="container hero">
      <div>
        <div className="eyebrow"><span className="eyebrow-dot" /> AI-aankoopbegeleider voor gewone kopers</div>
        <h1>Koop een huis <em>zonder</em> makelaar ernaast.</h1>
        <p className="hero-copy">WoonReality doet het voorbereidende werk van een aankoopmakelaar: onderzoek, documenten, bezichtiging en een bodconcept. Jij blijft degene die belt, biedt en tekent.</p>
        <AddressSearch />
        <ListingIntake />
        <div className="hero-note"><ShieldCheck size={15} /> Geen verborgen AI-score. Wel signalen, stukken en volgende stappen die je kunt controleren.</div>
      </div>
      <div className="hero-visual" aria-label="Voorbeeld van een WoonReality analyse">
        <div className="visual-card"><div className="visual-map" /><div className="visual-top"><span className="visual-label">Live reality check</span><span className="visual-time">09:42 · BAG + BGT</span></div><div className="visual-building" /><div className="visual-pin"><MapPinIcon /></div><div className="visual-score"><div className="visual-score-label">Reality score</div><div className="visual-score-number">7,8<span>/ 10</span></div><div className="visual-score-meta">sterke basis, let op geluid</div></div></div>
        <div className="floating-tag"><span className="tag-icon"><Leaf size={15} /></span><span><strong>Groen 8,7</strong>binnen 250 m</span></div>
      </div>
    </section>
    <div className="container proof-strip" id="bronnen"><Proof icon={<LocateFixed size={17} />} title="Adresgericht" text="BAG als vaste woningidentiteit" /><Proof icon={<FileCheck2 size={17} />} title="Herleidbaar" text="Bron en caveat bij elk signaal" /><Proof icon={<Map size={17} />} title="Jij houdt controle" text="Geen bod of mail zonder jouw actie" /></div>
    <section className="container section" id="werkwijze"><div className="section-heading"><div className="eyebrow"><span className="eyebrow-dot" /> wat een makelaar ook zou doen</div><h2>Van eerste twijfel tot sleutel.</h2><p>Eerst de plek checken met open data. Daarna stukken lezen, een bezichtiging voorbereiden en pas dan een bodconcept — met ontbindende voorwaarden, geen winkans-theater.</p></div><div className="feature-grid"><Feature icon={<LocateFixed size={18} />} title="De plek" text="BAG, gebouw, groen en lokale topografie op het exacte woonadres." /><Feature icon={<SunMedium size={18} />} title="De stukken" text="Brochure, vragenlijst en VvE naast de feiten. Tegenstrijdigheden worden zichtbaar." /><Feature icon={<Landmark size={18} />} title="De hypotheek" text="Maximale lening op de leennormen 2026: loondienst, zelfstandig, schulden, NHG en energielabel." href="/hypotheek" /><Feature icon={<ArrowUpRight size={18} />} title="De volgende stap" text="Geen stellige conclusie, maar één actie: bezichtigen, doorvragen of laten vallen." /></div></section>
    <footer className="container footer"><span><strong>WoonReality</strong> · AI-aankoopbegeleider</span><span>Open data, menselijke uitleg, jij tekent.</span></footer>
  </main>;
}

function Proof({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="proof-item"><span className="proof-item-icon">{icon}</span><span><strong>{title}</strong><span>{text}</span></span></div>; }
function Feature({ icon, title, text, href }: { icon: React.ReactNode; title: string; text: string; href?: string }) {
  const inner = <><span className="feature-card-icon">{icon}</span><h3>{title}</h3><p>{text}</p></>;
  return href ? <a className="feature-card" href={href}>{inner}</a> : <div className="feature-card">{inner}</div>;
}
function MapPinIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>; }
