import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

const stageLabels: Record<string, string> = {
  profile: "Woonprofiel",
  shortlist: "Vergelijken",
  documents: "Documenten controleren",
  viewing: "Bezichtiging voorbereiden",
  offer: "Bod voorbereiden",
  contract: "Koopcontract controleren",
  transfer: "Op weg naar de sleutel",
};

export default async function MyPurchasePage() {
  if (!isSupabaseConfigured()) return <main className="site-shell"><div className="container loading-shell"><h1>Je aankoopdossier komt eraan.</h1><p className="hero-copy">Supabase is nog niet geconfigureerd voor deze omgeving.</p></div></main>;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: cases } = await supabase.from("purchase_cases").select("*").eq("user_id", auth.user.id).order("updated_at", { ascending: false });
  return <main className="site-shell"><div className="container purchase-page">
    <div className="purchase-page-top"><div><div className="eyebrow"><span className="eyebrow-dot" /> jouw aankoop</div><h1>Wat wil je nu doen?</h1><p className="hero-copy">Je hoeft niet alles vandaag te regelen. We bewaren waar je bent gebleven.</p></div><SignOutButton /></div>
    {!cases?.length ? <section className="empty-state"><h2>Nog geen aankoopdossier</h2><p>Open een woninganalyse en klik op “Start mijn aankoopdossier”.</p><Link className="primary-button" href="/">Zoek een woning</Link></section> : <section className="case-list">{cases.map((purchaseCase) => <Link className="case-card" href={`/mijn-aankoop/${purchaseCase.id}`} key={purchaseCase.id}><span className="case-card-step">Stap: {stageLabels[purchaseCase.stage] ?? purchaseCase.stage}</span><h2>{purchaseCase.title}</h2><p>Open je dossier om je volgende taak te zien.</p><span className="case-card-link">Ga verder →</span></Link>)}</section>}
  </div></main>;
}
