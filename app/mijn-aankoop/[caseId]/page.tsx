import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import { CaseTools } from "@/components/case-tools";

const stageLabels: Record<string, string> = { profile: "Je woonprofiel", shortlist: "Woningen vergelijken", documents: "Documenten controleren", viewing: "Bezichtiging", offer: "Bod voorbereiden", contract: "Koopcontract", transfer: "Overdracht" };

export default async function PurchaseCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login");
  const { caseId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const [{ data: purchaseCase }, { data: tasks }, { data: documents }, { data: findings }] = await Promise.all([
    supabase.from("purchase_cases").select("*").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("case_documents").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    supabase.from("document_findings").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).eq("status", "open").order("created_at", { ascending: false }),
  ]);
  if (!purchaseCase) notFound();
  const nextTask = tasks?.[0];
  return <main className="site-shell"><div className="container purchase-page">
    <Link className="back-link" href="/mijn-aankoop">← Mijn aankoop</Link>
    <div className="case-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {stageLabels[purchaseCase.stage] ?? "Aankoopdossier"}</div><h1>{purchaseCase.title}</h1><p className="hero-copy">We houden het overzicht. Begin met de eerstvolgende stap.</p></div><span className="case-progress">{purchaseCase.status === "active" ? "Bezig" : purchaseCase.status}</span></div>
    <section className="next-step-card"><span className="section-kicker">Eerstvolgende stap</span><h2>{nextTask?.title ?? "Je loopt voor op schema"}</h2><p>{nextTask?.description ?? "Er staan nu geen open taken. Voeg een document toe of werk je woonprofiel bij wanneer je klaar bent."}</p>{nextTask?.due_at && <small>Voor {new Date(nextTask.due_at).toLocaleDateString("nl-NL", { dateStyle: "long" })}</small>}<button className="primary-button" type="button">Open deze stap</button></section>
    <div className="case-overview-grid"><section className="case-panel"><span className="section-kicker">Je voortgang</span><div className="case-steps">{Object.entries(stageLabels).map(([key, label], index) => <div className={`case-step ${key === purchaseCase.stage ? "current" : index < Object.keys(stageLabels).indexOf(purchaseCase.stage) ? "done" : ""}`} key={key}><span>{index + 1}</span><strong>{label}</strong></div>)}</div></section><section className="case-panel"><span className="section-kicker">Open punten</span><p className="case-count"><strong>{tasks?.length ?? 0}</strong> taken</p><p className="case-count"><strong>{documents?.length ?? 0}</strong> documenten</p><p className="case-count"><strong>{findings?.length ?? 0}</strong> aandachtspunten</p></section></div>
    <CaseTools caseId={caseId} initialDocuments={documents ?? []} initialTasks={tasks ?? []} />
    <p className="dashboard-disclaimer">WoonReality helpt je voorbereiden. Een notaris, taxateur of bouwkundig inspecteur blijft nodig voor specialistische en formele controles.</p>
  </div></main>;
}
