"use client";

import { CheckCircle2, FileCheck2, Leaf, LocateFixed, Map, ShieldCheck, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { AddressSearch } from "@/components/address-search";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";

export function LandingPage() {
  const t = useTranslations("landing");
  return (
    <main className="site-shell landing-shell">
      <div className="container"><SiteHeader current="home" /></div>
      <section className="container hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-dot" /> {t("eyebrow")}</div>
          <h1>{t("h1Start")} <em>{t("h1Emphasis")}</em> {t("h1End")}</h1>
          <p className="hero-copy">
            {t("heroCopyStart")} <strong>{t("heroCopyStrong")}</strong> {t("heroCopyEnd")}
          </p>
          <AddressSearch />
          <div className="hero-note"><ShieldCheck size={15} /> {t("heroNote")}</div>
        </div>
        <div className="hero-visual" aria-label={t("heroVisualAria")}>
          <div className="visual-card">
            <div className="visual-grid" />
            <div className="visual-map" />
            <div className="visual-top">
              <span className="visual-label"><Sparkles size={11} /> {t("visualLabel")}</span>
              <span className="visual-time">{t("visualTime")}</span>
            </div>
            <div className="visual-building" />
            <div className="visual-pin"><MapPinIcon /></div>
            <div className="visual-score">
              <div className="visual-score-label">{t("visualLabel")}</div>
              <div className="visual-score-number">7,8<span>/ 10</span></div>
              <div className="visual-score-meta"><span /> {t("visualScoreMeta")}</div>
            </div>
            <div className="visual-source"><CheckCircle2 size={13} /> {t("visualSource")}</div>
          </div>
          <div className="floating-tag">
            <span className="tag-icon"><Leaf size={15} /></span>
            <span><strong>{t("tagGreenStrong")}</strong>{t("tagGreenText")}</span>
          </div>
        </div>
      </section>
      <Card className="container proof-strip" id="bronnen">
        <Proof icon={<LocateFixed size={17} />} title={t("proofAddressTitle")} text={t("proofAddressText")} />
        <Proof icon={<FileCheck2 size={17} />} title={t("proofSourceTitle")} text={t("proofSourceText")} />
        <Proof icon={<Map size={17} />} title={t("proofControlTitle")} text={t("proofControlText")} />
      </Card>
      <section className="container section" id="werkwijze">
        <div className="section-heading">
          <div className="eyebrow"><span className="eyebrow-dot" /> {t("sectionEyebrow")}</div>
          <h2>{t("sectionTitle")}</h2>
          <p>{t("sectionLead")}</p>
        </div>
        <div className="werkwijze-steps">
          <Step number="1" title={t("step1Title")} text={t("step1Text")} />
          <Step number="2" title={t("step2Title")} text={t("step2Text")} />
          <Step number="3" title={t("step3Title")} text={t("step3Text")} />
        </div>
      </section>
      <footer className="container footer">
        <span><strong>WoonReality</strong> · {t("footerBrandTagline")}</span>
        <span>{t("footerLine2")}</span>
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
    <Card className="werkwijze-step">
      <span className="werkwijze-step-number">{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </Card>
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
