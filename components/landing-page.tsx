"use client";

import { CheckCircle2, FileCheck2, Leaf, LocateFixed, Map, ShieldCheck, Sparkles } from "lucide-react";
import { AddressSearch } from "@/components/address-search";
import { ListingIntake } from "@/components/listing-intake";
import { SiteHeader } from "@/components/site-header";

export function LandingPage() {
  return (
    <main className="site-shell landing-shell">
      <div className="container"><SiteHeader current="home" /></div>
      <section className="container hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> Gratis woningcheck</div>
          <h1>Weet waar je <em>écht</em> gaat wonen.</h1>
          <p className="hero-copy">
            Typ een Nederlands adres of plak een Funda-link. Je krijgt een eerste indruk in gewone taal — wat sterk is, waar je op moet letten, en wat je nu kunt doen. Een account is niet nodig.
          </p>
          <AddressSearch />
          <ListingIntake />
          <div className="hero-note"><ShieldCheck size={15} /> Geen verborgen score. Wel uitleg met bronnen die je zelf kunt checken.</div>
        </div>
        <div className="hero-visual" aria-label="Voorbeeld van een WoonReality analyse">
          <div className="visual-card">
            <div className="visual-grid" />
            <div className="visual-map" />
            <div className="visual-top">
              <span className="visual-label"><Sparkles size={11} /> Eerste indruk</span>
              <span className="visual-time">Open data</span>
            </div>
            <div className="visual-building" />
            <div className="visual-pin"><MapPinIcon /></div>
            <div className="visual-score">
              <div className="visual-score-label">Eerste indruk</div>
              <div className="visual-score-number">7,8<span>/ 10</span></div>
              <div className="visual-score-meta"><span /> sterke basis, let op geluid</div>
            </div>
            <div className="visual-source"><CheckCircle2 size={13} /> 12 signalen met bron</div>
          </div>
          <div className="floating-tag">
            <span className="tag-icon"><Leaf size={15} /></span>
            <span><strong>Groen 8,7</strong>binnen 250 m</span>
          </div>
        </div>
      </section>
      <div className="container proof-strip" id="bronnen">
        <Proof icon={<LocateFixed size={17} />} title="Officieel adres" text="We zoeken op het echte woonadres" />
        <Proof icon={<FileCheck2 size={17} />} title="Elk punt met bron" text="Je ziet waar een signaal vandaan komt" />
        <Proof icon={<Map size={17} />} title="Jij belt en biedt" text="Wij versturen niets zonder jouw actie" />
      </div>
      <section className="container section" id="werkwijze">
        <div className="section-heading">
          <div className="eyebrow"><span className="eyebrow-dot" /> zo werkt het</div>
          <h2>Drie stappen. Meer niet.</h2>
          <p>Eerst kijken of de plek klopt. Daarna beslis je: bezichtigen, bewaren of laten vallen. De rest komt pas als je het huis serieus neemt.</p>
        </div>
        <div className="werkwijze-steps">
          <Step number="1" title="Typ een adres" text="Straat, huisnummer en plaats. Wij zoeken het officiële adres op." />
          <Step number="2" title="Lees je eerste indruk" text="Gewone taal over straat, energie en je dagelijkse route — met bron erbij." />
          <Step number="3" title="Kies wat je doet" text="Bezichtigen, bewaren of laten vallen. Hypotheek en bod komen later." />
        </div>
      </section>
      <footer className="container footer">
        <span><strong>WoonReality</strong> · weet waar je écht gaat wonen</span>
        <span>Open data, menselijke uitleg, jij tekent.</span>
      </footer>
    </main>
  );
}

function Proof({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="proof-item">
      <span className="proof-item-icon">{icon}</span>
      <span><strong>{title}</strong><span>{text}</span></span>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="werkwijze-step">
      <span className="werkwijze-step-number">{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
