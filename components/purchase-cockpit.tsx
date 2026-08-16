"use client";

import { ArrowRight, Check, CircleAlert, FileText, Home, Landmark, MapPin, Pencil, PiggyBank, Plus, Search, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AddressSearch } from "@/components/address-search";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { calculatePersonalFit } from "@/src/lib/personalization";
import { CASE_STAGE_LABELS, nextPurchaseAction, normalizeCaseStage } from "@/src/lib/journey";
import { EMPTY_BUYER_PROFILE, HOUSEHOLD_LABELS, PROPERTY_STAGE_LABELS, PROPERTY_STAGE_ORDER, PROPERTY_TYPE_LABELS, formatEuro, profileCompletion, type BuyerProfile, type HouseholdType, type PropertyStage, type SoughtPropertyType } from "@/src/lib/purchase";
import type { Analysis } from "@/src/lib/types";

type CaseSummary = { id: string; title: string; stage: string; status: string; updated_at: string; bagVboId?: string | null };

function caseStageLabel(stage: string) {
  return CASE_STAGE_LABELS[normalizeCaseStage(stage)];
}

export function PurchaseCockpit({ initialCases = [], focusCase }: { initialCases?: CaseSummary[]; focusCase?: string }) {
  const { workspace, workspaceReady, workspaceError, setBuyerProfile, setPropertyStage } = usePropertyWorkspace();
  const [profile, setProfile] = useState<BuyerProfile>(EMPTY_BUYER_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);

  useEffect(() => {
    if (!editingProfile) setProfile(workspace.buyerProfileConfigured ? workspace.buyerProfile : EMPTY_BUYER_PROFILE);
  }, [editingProfile, workspace.buyerProfile, workspace.buyerProfileConfigured]);

  const savedKey = workspace.saved.map((saved) => saved.bagVboId).join("|");
  const savedHomes = useMemo(() => workspace.saved, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!savedHomes.length) {
      setAnalyses({});
      return;
    }
    let active = true;
    setLoadingAnalyses(true);
    Promise.all(savedHomes.slice(0, 8).map(async (saved) => {
      try {
        const response = await fetch(`/api/analysis/${encodeURIComponent(saved.bagVboId)}`);
        return response.ok ? [saved.bagVboId, await response.json() as Analysis] as const : null;
      } catch { return null; }
    })).then((items) => {
      if (!active) return;
      setAnalyses(Object.fromEntries(items.filter((item): item is readonly [string, Analysis] => Boolean(item))));
    }).finally(() => { if (active) setLoadingAnalyses(false); });
    return () => { active = false; };
  }, [savedHomes]);

  const profileConfigured = workspaceReady && workspace.buyerProfileConfigured;
  const completion = profileConfigured ? profileCompletion(profile) : 0;
  const activeHomes = useMemo(() => savedHomes.filter((item) => workspace.propertyStages[item.bagVboId] !== "dropped"), [savedHomes, workspace.propertyStages]);
  const activeCase = initialCases.find((item) => item.status === "active") ?? initialCases[0];
  const nextAction = useMemo(() => {
    if (!workspaceReady) return { title: "Aankoopomgeving laden", text: "Je profiel en woningen worden opgehaald.", href: "#woonprofiel", urgency: "normal" as const };
    const focus = activeHomes.find((home) => home.bagVboId === activeCase?.bagVboId) ?? activeHomes[0];
    return nextPurchaseAction({
      profileConfigured,
      workspaceError: workspaceError || undefined,
      savedCount: activeHomes.length,
      propertyStage: focus ? workspace.propertyStages[focus.bagVboId] : undefined,
      bagVboId: focus?.bagVboId ?? activeCase?.bagVboId ?? undefined,
      caseId: activeCase?.id,
      caseStage: activeCase ? normalizeCaseStage(activeCase.stage) : undefined,
    });
  }, [activeCase, activeHomes, profileConfigured, workspace.propertyStages, workspaceError, workspaceReady]);

  async function saveProfile() {
    const result = await setBuyerProfile(profile);
    if (result.ok) setEditingProfile(false);
  }

  function updateNumber(key: "budget" | "monthlyPayment" | "ownFunds" | "bedrooms" | "maxCommuteMinutes" | "buyerAge", value: string) {
    setProfile((current) => ({ ...current, [key]: Number(value) || 0 }));
  }

  const hasHomes = workspace.saved.length > 0;
  const firstRun = !hasHomes && initialCases.length === 0;

  return <main className="site-shell"><div className="container purchase-cockpit">
    <div className="cockpit-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> mijn aankoop</div><h1>{firstRun ? "Begin met een adres." : "Jouw aankoopoverzicht."}</h1><p className="hero-copy">{firstRun ? "Zoek een woning, klik op Bewaar, en alles wat je nodig hebt komt hier terug." : "Eén overzicht: wat je zoekt, welke woningen serieus zijn, en wat je nu moet doen."}</p></div>{!firstRun && <Link className="primary-button" href="/#zoek-adres"><Plus size={15} /> Woning toevoegen</Link>}</div>

    {focusCase && <Notice><Check size={15} /> Je aankoopdossier is gestart. Vul eerst je woonprofiel aan.</Notice>}
    {workspaceError && <Notice tone="warning" role="alert"><CircleAlert size={15} /> {workspaceError} <Link href="/login">Inloggen</Link></Notice>}

    {firstRun ? (
      <section className="cockpit-first-run" aria-label="Eerste woning toevoegen">
        <EmptyState
          icon={<Home size={20} />}
          title="Nog geen woningen bewaard"
          text="Zoek een adres hieronder. Op de woningcheck klik je op Bewaar — daarna verschijnt het huis hier."
        />
        <AddressSearch submitLabel="Bekijk adres" />
      </section>
    ) : (
      <>
        <section className="cockpit-stats" aria-label="Jouw woningsituatie">
          <div><span><WalletCards size={14} /> Koopbudget</span><strong>{profileConfigured ? formatEuro(profile.budget) : "—"}</strong><small>{profileConfigured ? "maximale koopsom" : "Na invullen van je profiel"}</small></div>
          <div><span><PiggyBank size={14} /> Eigen geld</span><strong>{profileConfigured ? formatEuro(profile.ownFunds) : "—"}</strong><small>{profileConfigured ? "voor kosten koper en inleg" : "Na invullen van je profiel"}</small></div>
          <div><span><Home size={14} /> Actieve woningen</span><strong>{activeHomes.length}</strong><small>{activeHomes.length === 1 ? "woning in beeld" : "woningen in beeld"}</small></div>
          <div><span><CircleAlert size={14} /> Eerstvolgende</span><strong className="stat-action">{nextAction.title}</strong><small>{nextAction.text}</small></div>
        </section>

        <div className="cockpit-grid">
          <section className="cockpit-card profile-card" id="woonprofiel">
            <div className="card-heading"><div><div className="section-kicker">Stap 01 · Mijn woonprofiel</div><h2>Wat moet jouw volgende huis kunnen?</h2><p>Budget, huishouden en must-haves sturen de check. Geen marketingvoorkeuren, wel harde grenzen.</p></div><button className="icon-button" type="button" onClick={() => setEditingProfile((value) => !value)} aria-label="Woonprofiel bewerken"><Pencil size={15} /></button></div>
            {editingProfile ? <ProfileForm profile={profile} setProfile={setProfile} updateNumber={updateNumber} onSave={saveProfile} /> : <ProfileSummary profile={profile} completion={completion} configured={profileConfigured} onEdit={() => setEditingProfile(true)} />}
          </section>
          <section className="cockpit-card next-action-card"><div className="section-kicker">Jouw volgende stap</div><h2>{nextAction.title}</h2><p>{nextAction.text}</p><Link className="primary-button" href={nextAction.href as never}>Open stap <ArrowRight size={15} /></Link><div className="action-note"><ShieldCheck size={14} /> WoonReality verstuurt geen bod en vervangt geen notaris of keurder.</div></section>
        </div>

        <section className="cockpit-section" id="mijn-woningen"><div className="section-inline-heading"><div><div className="eyebrow"><Home size={13} /> stap 02 · mijn woningen</div><h2>Je woningbord</h2><p>Status volgt je acties zoveel mogelijk. Je kunt hem zelf bijstellen als de praktijk anders loopt.</p></div><Link className="secondary-button" href="/#zoek-adres"><Search size={14} /> Adres zoeken</Link></div>
          {!hasHomes ? (
            <EmptyState
              icon={<Home size={20} />}
              title="Nog geen woningen opgeslagen"
              text="Open een woningcheck en klik op Bewaar. Daarna verschijnt de woning hier automatisch."
              action={<Link className="primary-button" href="/#zoek-adres">Check je eerste adres <ArrowRight size={14} /></Link>}
            />
          ) : (
            <div className="home-board">{activeHomes.map((saved) => {
              const linkedCase = initialCases.find((item) => item.bagVboId === saved.bagVboId);
              return <HomeBoardCard key={saved.bagVboId} saved={saved} analysis={analyses[saved.bagVboId]} preferences={workspace.preferences} stage={workspace.propertyStages[saved.bagVboId] ?? "saved"} caseId={linkedCase?.id} onStageChange={(stage) => setPropertyStage(saved.bagVboId, stage)} loading={loadingAnalyses && !analyses[saved.bagVboId]} />;
            })}</div>
          )}
        </section>

        {initialCases.length > 0 && <section className="cockpit-section"><div className="section-inline-heading"><div><div className="eyebrow"><FileText size={13} /> stap 03 · koopdossier</div><h2>Actieve dossiers</h2><p>Documenten, taken en deadlines op één plek.</p></div></div><div className="case-mini-grid">{initialCases.map((purchaseCase) => <Link className="case-mini-card" href={`/mijn-aankoop/${purchaseCase.id}`} key={purchaseCase.id}><span className="case-card-step">{caseStageLabel(purchaseCase.stage)}</span><strong>{purchaseCase.title}</strong><span>Open dossier <ArrowRight size={13} /></span></Link>)}</div></section>}

        <section className="cockpit-section modules-section"><div className="section-inline-heading"><div><div className="eyebrow"><Sparkles size={13} /> de aankoopcockpit</div><h2>Alles wat je nodig hebt na de advertentie</h2></div></div><div className="module-grid"><Module icon={<Search size={17} />} number="01" title="Woningcheck" text="Feiten, bronnen, omgeving en risico's per adres." href={activeHomes[0] ? `/woning/${activeHomes[0].bagVboId}` : "/#zoek-adres"} /><Module icon={<FileText size={17} />} number="02" title="Documentdossier" text="Uploaden, lezen en tegenstrijdigheden vinden." href={activeCase ? `/mijn-aankoop/${activeCase.id}#documenten` : "/login"} /><Module icon={<WalletCards size={17} />} number="03" title="Waarde & bod" text="Vraagprijs, risico's, voorwaarden en je maximum — geen neptaxatie." href={activeCase ? `/mijn-aankoop/${activeCase.id}#waarde-bod` : activeHomes[0] ? `/woning/${activeHomes[0].bagVboId}#bodconcept` : "/#zoek-adres"} /><Module icon={<Landmark size={17} />} number="04" title="Hypotheek" text="Maximale lening op de leennormen 2026, ook als zelfstandige." href="/hypotheek" /></div></section>
      </>
    )}
  </div></main>;
}

function ProfileSummary({ profile, completion, configured, onEdit }: { profile: BuyerProfile; completion: number; configured: boolean; onEdit: () => void }) {
  return <div className="profile-summary"><div className="completion-row"><span>{configured ? `Profiel ${completion}% compleet` : "Profiel nog niet ingevuld"}</span><button className="text-link" type="button" onClick={onEdit}>{configured ? "Bewerken" : "Invullen"}</button></div><div className="completion-track"><i style={{ width: `${completion}%` }} /></div><div className="profile-summary-grid"><div><small>Zoekgebied</small><strong>{configured ? profile.searchArea || "Nog invullen" : "Nog invullen"}</strong></div><div><small>Max. maandlast</small><strong>{configured ? formatEuro(profile.monthlyPayment) : "Nog invullen"}</strong></div><div><small>Huishouden</small><strong>{configured ? HOUSEHOLD_LABELS[profile.household] : "Nog invullen"}</strong></div><div><small>Must-haves</small><strong>{configured ? [profile.garden && "Tuin", profile.parking && "Oprit", profile.firstTimeBuyer && "Starter", profile.nhg && "NHG"].filter(Boolean).join(" · ") || "Nog kiezen" : "Nog kiezen"}</strong></div></div></div>;
}

function ProfileForm({ profile, setProfile, updateNumber, onSave }: { profile: BuyerProfile; setProfile: React.Dispatch<React.SetStateAction<BuyerProfile>>; updateNumber: (key: "budget" | "monthlyPayment" | "ownFunds" | "bedrooms" | "maxCommuteMinutes" | "buyerAge", value: string) => void; onSave: () => void }) {
  return <div className="profile-form"><div className="form-grid"><label>Koopbudget<input type="number" min="0" step="5000" value={profile.budget || ""} onChange={(event) => updateNumber("budget", event.target.value)} /></label><label>Max. maandlast<input type="number" min="0" step="50" value={profile.monthlyPayment || ""} onChange={(event) => updateNumber("monthlyPayment", event.target.value)} /></label><label>Eigen geld<input type="number" min="0" step="5000" value={profile.ownFunds || ""} onChange={(event) => updateNumber("ownFunds", event.target.value)} /></label><label>Zoekgebied<input value={profile.searchArea} onChange={(event) => setProfile((current) => ({ ...current, searchArea: event.target.value }))} placeholder="Utrecht + 20 km" /></label><label>Min. slaapkamers<input type="number" min="1" max="20" value={profile.bedrooms || ""} onChange={(event) => updateNumber("bedrooms", event.target.value)} /></label><label>Max. reistijd (min)<input type="number" min="0" max="240" value={profile.maxCommuteMinutes || ""} onChange={(event) => updateNumber("maxCommuteMinutes", event.target.value)} /></label><label>Leeftijd koper<input type="number" min="0" max="120" value={profile.buyerAge || ""} onChange={(event) => updateNumber("buyerAge", event.target.value)} /></label><label>Huishouden<select value={profile.household} onChange={(event) => setProfile((current) => ({ ...current, household: event.target.value as HouseholdType, householdSpecified: true }))}>{Object.entries(HOUSEHOLD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Woningtype<select value={profile.propertyType} onChange={(event) => setProfile((current) => ({ ...current, propertyType: event.target.value as SoughtPropertyType }))}>{Object.entries(PROPERTY_TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div><div className="toggle-grid"><label><input type="checkbox" checked={profile.garden} onChange={(event) => setProfile((current) => ({ ...current, garden: event.target.checked }))} /> Tuin verplicht</label><label><input type="checkbox" checked={profile.parking} onChange={(event) => setProfile((current) => ({ ...current, parking: event.target.checked }))} /> Eigen oprit</label><label><input type="checkbox" checked={profile.remoteWork} onChange={(event) => setProfile((current) => ({ ...current, remoteWork: event.target.checked }))} /> Werkkamer belangrijk</label><label><input type="checkbox" checked={profile.firstTimeBuyer} onChange={(event) => setProfile((current) => ({ ...current, firstTimeBuyer: event.target.checked }))} /> Starter</label><label><input type="checkbox" checked={profile.selfOccupied} onChange={(event) => setProfile((current) => ({ ...current, selfOccupied: event.target.checked }))} /> Zelf bewonen</label><label><input type="checkbox" checked={profile.priorExemptionUsed} onChange={(event) => setProfile((current) => ({ ...current, priorExemptionUsed: event.target.checked }))} /> Startersvrijstelling al gebruikt</label><label><input type="checkbox" checked={profile.nhg} onChange={(event) => setProfile((current) => ({ ...current, nhg: event.target.checked }))} /> NHG gewenst</label><label><input type="checkbox" checked={profile.acceptVve} onChange={(event) => setProfile((current) => ({ ...current, acceptVve: event.target.checked }))} /> Appartement / VvE oké</label></div><div className="form-actions"><button className="secondary-button" type="button" onClick={onSave}>Profiel opslaan</button></div></div>;
}

function HomeBoardCard({ saved, analysis, preferences, stage, caseId, onStageChange, loading }: { saved: { bagVboId: string; addressLabel: string; city: string; postcode: string }; analysis?: Analysis; preferences: Parameters<typeof calculatePersonalFit>[1]; stage: PropertyStage; caseId?: string; onStageChange: (stage: PropertyStage) => void; loading: boolean }) {
  const personalFit = analysis ? calculatePersonalFit(analysis, preferences) : null;
  const attention = analysis?.highlights?.find((item) => item.type === "attention")?.text;
  return <article className="home-board-card"><div className="home-card-top"><div className="home-card-address"><span className="home-card-icon"><MapPin size={15} /></span><div><h3>{saved.addressLabel.split(",")[0]}</h3><span>{saved.postcode} {saved.city}</span></div></div><span className="match-pill">{loading ? "…" : personalFit != null ? `${personalFit.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} match` : analysis ? `${analysis.overallScore.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} score` : "Onderzoek"}</span></div><div className="home-card-meta">{analysis?.property.areaM2 ? <span>{analysis.property.areaM2} m²</span> : <span>Oppervlakte laden</span>}{analysis?.property.buildingYear ? <span>Bouwjaar {analysis.property.buildingYear}</span> : null}</div>{attention && <div className="home-card-alert"><CircleAlert size={13} /> {attention}</div>}<div className="home-card-footer"><select aria-label={`Status van ${saved.addressLabel}`} value={stage} onChange={(event) => onStageChange(event.target.value as PropertyStage)}>{PROPERTY_STAGE_ORDER.map((option) => <option value={option} key={option}>{PROPERTY_STAGE_LABELS[option]}</option>)}</select><Link className="text-link" href={caseId ? `/mijn-aankoop/${caseId}` : `/woning/${saved.bagVboId}`}>{caseId ? "Open dossier" : "Open woningcheck"} <ArrowRight size={13} /></Link></div></article>;
}

function Module({ icon, number, title, text, href }: { icon: React.ReactNode; number: string; title: string; text: string; href: string }) {
  return <Link className="module-card" href={href as never}><span className="module-number">{number}</span><span className="module-icon">{icon}</span><h3>{title}</h3><p>{text}</p><span className="module-link">Open onderdeel <ArrowRight size={13} /></span></Link>;
}
