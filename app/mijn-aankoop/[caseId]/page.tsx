import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import { CaseTools } from "@/components/case-tools";
import { PurchaseWorkflow } from "@/components/purchase-workflow";
import { SiteHeader } from "@/components/site-header";
import { CASE_STAGE_LABELS, CASE_STAGES, nextPurchaseAction, normalizeCaseStage, type CaseStage } from "@/src/lib/journey";
import { JOURNEY_CHECKLIST, journeyStageStatus } from "@/src/lib/journey-checklist";
import { PROFESSIONAL_GUIDES } from "@/src/lib/professionals";
import { hrefForTask } from "@/src/lib/tasks";
import type { CaseEventRow } from "@/src/lib/supabase/database.types";

export default async function PurchaseCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login");
  const { caseId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const [{ data: purchaseCase }, { data: tasks }, { data: documents }, { data: findings }, { data: events }] = await Promise.all([
    supabase.from("purchase_cases").select("*, properties(bag_vbo_id, address_label)").eq("id", caseId).eq("user_id", auth.user.id).maybeSingle(),
    supabase.from("case_tasks").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).eq("status", "open").order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("case_documents").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    supabase.from("document_findings").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    supabase.from("case_events").select("*").eq("case_id", caseId).eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(12),
  ]);
  if (!purchaseCase) notFound();
  const property = Array.isArray(purchaseCase.properties) ? purchaseCase.properties[0] : purchaseCase.properties;
  const bagVboId = property && typeof property === "object" && "bag_vbo_id" in property ? String(property.bag_vbo_id) : null;
  const stage = normalizeCaseStage(purchaseCase.stage);
  const nextTask = tasks?.[0];
  const openFindings = (findings ?? []).filter((item) => item.status === "open").length;
  const fallbackAction = nextPurchaseAction({ profileConfigured: true, savedCount: 1, caseId, caseStage: stage, bagVboId: bagVboId ?? undefined, openFindings });
  const nextHref = nextTask ? hrefForTask(nextTask, { caseId, bagVboId }) : fallbackAction.href;

  return <main className="site-shell"><div className="container"><SiteHeader current="aankoop" /></div><div className="container purchase-page">
    <Link className="back-link" href="/mijn-aankoop">← Mijn aankoop</Link>
    <div className="case-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {CASE_STAGE_LABELS[stage]}</div><h1>{purchaseCase.title}</h1><p className="hero-copy">We houden het overzicht. Begin met de eerstvolgende stap.</p></div><span className="case-progress">{purchaseCase.status === "active" ? "Bezig" : purchaseCase.status}</span></div>
    <section className="next-step-card"><span className="section-kicker">Eerstvolgende stap</span><h2>{nextTask?.title ?? fallbackAction.title}</h2><p>{nextTask?.description ?? fallbackAction.text}</p>{nextTask?.due_at && <small>Voor {new Date(nextTask.due_at).toLocaleDateString("nl-NL", { dateStyle: "long" })}</small>}<Link className="primary-button" href={nextHref as never}>Open deze stap</Link></section>
    <div className="case-overview-grid"><section className="case-panel"><span className="section-kicker">Je voortgang</span><div className="case-steps">{CASE_STAGES.map((key, index) => { const currentIndex = CASE_STAGES.indexOf(stage); return <div className={`case-step ${key === stage ? "current" : index < currentIndex ? "done" : ""}`} key={key}><span>{index + 1}</span><strong>{CASE_STAGE_LABELS[key]}</strong></div>; })}</div>{bagVboId && <p className="muted-copy"><Link href={`/woning/${bagVboId}`}>Open woningcheck</Link> · <Link href={`/woning/${bagVboId}/bezichtiging`}>Bezichtigingsmodus</Link></p>}</section><section className="case-panel"><span className="section-kicker">Open punten</span><p className="case-count"><strong>{tasks?.length ?? 0}</strong> taken</p><p className="case-count"><strong>{documents?.length ?? 0}</strong> documenten</p><p className="case-count"><strong>{openFindings}</strong> aandachtspunten</p></section></div>
    <CaseTimeline events={(events ?? []) as CaseEventRow[]} />
    <JourneyChecklist stage={stage} />
    <CaseTools caseId={caseId} initialDocuments={documents ?? []} initialTasks={tasks ?? []} initialFindings={findings ?? []} />
    <PurchaseWorkflow caseId={caseId} initialStage={stage} bagVboId={bagVboId} />
    <ProfessionalGuidancePanel />
    <p className="dashboard-disclaimer">WoonReality helpt je voorbereiden. Een notaris, taxateur of bouwkundig inspecteur blijft nodig voor specialistische en formele controles.</p>
  </div></main>;
}

function CaseTimeline({ events }: { events: CaseEventRow[] }) {
  if (!events.length) return null;
  return <section className="case-panel case-timeline"><span className="section-kicker">Tijdlijn</span><h2>Wat er al gebeurde</h2><ol>{events.map((event) => <li key={event.id}><strong>{eventLabel(event.event_type)}</strong><small>{new Date(event.created_at).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}</small></li>)}</ol></section>;
}

function eventLabel(type: string) {
  if (type === "stage_changed") return "Stap bijgewerkt";
  if (type === "document_uploaded") return "Document gelezen";
  if (type === "viewing_debrief") return "Bezichtiging afgerond";
  if (type === "case_started") return "Dossier gestart";
  return type;
}

function ProfessionalGuidancePanel() {
  return (
    <section className="case-panel professional-guidance" id="professionals">
      <span className="section-kicker">Zelf vinden en vergelijken</span>
      <h2>Notaris, keurder en taxateur</h2>
      <p className="muted-copy">
        WoonReality stelt geen &ldquo;beste keuze&rdquo; voor en heeft geen
        eigen netwerk — dat zou net zo min transparant zijn als een
        aankoopmakelaar met verborgen provisies. Dit zijn de criteria en de
        officiële, gratis registers om zelf onafhankelijke professionals te
        vinden en te vergelijken.
      </p>
      <div className="professional-guide-grid">
        {PROFESSIONAL_GUIDES.map((guide) => (
          <div key={guide.key} className="professional-guide-card">
            <strong>{guide.role}</strong>
            <p>{guide.whatTheyDo}</p>
            <ul>
              {guide.howToChoose.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            <a href={guide.registryUrl} target="_blank" rel="noreferrer">
              {guide.registryLabel}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

function JourneyChecklist({ stage }: { stage: CaseStage }) {
  return (
    <section className="case-panel journey-checklist" id="koopreis">
      <span className="section-kicker">Je hele koopreis</span>
      <h2>Van zoeken tot sleuteloverdracht</h2>
      <p className="muted-copy">
        Dit is precies wat een aankoopmakelaar per fase met je zou doorlopen.
        De concrete taken en aandachtspunten voor nu staan hierboven bij
        &ldquo;Open punten&rdquo;; dit overzicht laat zien wat er nog aankomt.
      </p>
      <ol className="journey-stage-list">
        {JOURNEY_CHECKLIST.map((entry) => {
          const status = journeyStageStatus(entry.stage, stage);
          return (
            <li key={entry.stage} className={`journey-stage journey-stage-${status}`}>
              <details open={status === "current"}>
                <summary>
                  <span className={`journey-stage-dot ${status}`} />
                  <strong>{CASE_STAGE_LABELS[entry.stage]}</strong>
                  {status === "done" && <span className="journey-stage-tag">Afgerond</span>}
                  {status === "current" && <span className="journey-stage-tag">Nu</span>}
                </summary>
                <ul>
                  {entry.items.map((item) => (
                    <li key={item.id}>{item.label}</li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
