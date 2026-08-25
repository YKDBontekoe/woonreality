import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/src/lib/i18n/navigation";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CaseTools } from "@/components/case-tools";
import { PurchaseWorkflow } from "@/components/purchase-workflow";
import { PageShell } from "@/components/ui/page-shell";
import { CASE_STAGE_LABELS, CASE_STAGES, nextPurchaseAction, normalizeCaseStage, type CaseStage } from "@/src/lib/journey";
import { journeyChecklist, journeyStageStatus } from "@/src/lib/journey-checklist";
import { PROFESSIONAL_GUIDES } from "@/src/lib/professionals";
import { hrefForTask } from "@/src/lib/tasks";
import { formatDate, formatDateTime } from "@/src/lib/format-locale";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import type { CaseEventRow } from "@/src/lib/supabase/database.types";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "mijn-aankoop" });
  return { title: t("metaTitle") };
}

export default async function PurchaseCasePage({ params }: { params: Promise<{ locale: string; caseId: string }> }) {
  if (!isSupabaseConfigured()) redirect("/login?next=/mijn-aankoop");
  const { locale, caseId } = await params;
  setRequestLocale(locale);
  const supabase = await createSupabaseServerClient();
  const [t, th] = await Promise.all([getTranslations("mijn-aankoop"), getTranslations("header")]);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/mijn-aankoop/${caseId}`)}`);
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
  // Serve the workflow panel from the shared analysis cache instead of a
  // client-side refetch of /api/analysis.
  const analysis = bagVboId
    ? await getPropertyById(bagVboId).then(getSharedAnalysis).catch(() => null)
    : null;

  return <PageShell current="aankoop" wrap={false}><div className="container purchase-page">
    <Breadcrumbs items={[{ href: "/mijn-aankoop", label: th("mijnAankoop") }, { label: purchaseCase.title }]} />
    <div className="case-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {CASE_STAGE_LABELS[stage]}</div><h1>{purchaseCase.title}</h1><p className="hero-copy">{t("caseHeroCopy")}</p></div><span className="case-progress">{purchaseCase.status === "active" ? t("statusActive") : purchaseCase.status}</span></div>
    <section className="next-step-card"><span className="section-kicker">{t("nextStepKickerCase")}</span><h2>{nextTask?.title ?? fallbackAction.title}</h2><p>{nextTask?.description ?? fallbackAction.text}</p>{nextTask?.due_at && <small>{t("dueBefore", { date: formatDate(nextTask.due_at, locale) })}</small>}<Link className="primary-button" href={nextHref as never}>{t("openThisStep")}</Link></section>
    <div className="case-overview-grid"><section className="case-panel"><span className="section-kicker">{t("progressKicker")}</span><div className="case-steps">{CASE_STAGES.map((key, index) => { const currentIndex = CASE_STAGES.indexOf(stage); return <div className={`case-step ${key === stage ? "current" : index < currentIndex ? "done" : ""}`} key={key}><span>{index + 1}</span><strong>{CASE_STAGE_LABELS[key]}</strong></div>; })}</div>{bagVboId && <p className="muted-copy"><Link href={`/woning/${bagVboId}`}>{t("openPropertyCheck")}</Link> · <Link href={`/woning/${bagVboId}/bezichtiging`}>{t("viewingMode")}</Link></p>}</section><section className="case-panel"><span className="section-kicker">{t("openPointsKicker")}</span><p className="case-count"><strong>{tasks?.length ?? 0}</strong> {t("tasksLabel")}</p><p className="case-count"><strong>{documents?.length ?? 0}</strong> {t("documentsLabel")}</p><p className="case-count"><strong>{openFindings}</strong> {t("findingsLabel")}</p></section></div>
    <CaseTimeline events={(events ?? []) as CaseEventRow[]} locale={locale} />
    <JourneyChecklist stage={stage} locale={locale} />
    <CaseTools caseId={caseId} initialDocuments={documents ?? []} initialTasks={tasks ?? []} initialFindings={findings ?? []} />
    <PurchaseWorkflow caseId={caseId} initialStage={stage} bagVboId={bagVboId} analysis={analysis} />
    <ProfessionalGuidancePanel />
    <p className="dashboard-disclaimer">{t("caseDisclaimer")}</p>
  </div></PageShell>;
}

async function CaseTimeline({ events, locale }: { events: CaseEventRow[]; locale: string }) {
  const t = await getTranslations("mijn-aankoop");
  if (!events.length) return null;
  const eventLabel = (type: string) => {
    if (type === "stage_changed") return t("eventStageChanged");
    if (type === "document_uploaded") return t("eventDocumentUploaded");
    if (type === "viewing_debrief") return t("eventViewingDebrief");
    if (type === "case_started") return t("eventCaseStarted");
    return type;
  };
  return <section className="case-panel case-timeline"><span className="section-kicker">{t("timelineKicker")}</span><h2>{t("timelineTitle")}</h2><ol>{events.map((event) => <li key={event.id}><strong>{eventLabel(event.event_type)}</strong><small>{formatDateTime(event.created_at, locale)}</small></li>)}</ol></section>;
}

async function ProfessionalGuidancePanel() {
  const t = await getTranslations("mijn-aankoop");
  return (
    <section className="case-panel professional-guidance" id="professionals">
      <span className="section-kicker">{t("professionalsKicker")}</span>
      <h2>{t("professionalsTitle")}</h2>
      <p className="muted-copy">
        {t("professionalsCopy")}
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
            {guide.registryUrl && guide.registryLabel && (
              <a href={guide.registryUrl} target="_blank" rel="noreferrer">
                {guide.registryLabel}
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

async function JourneyChecklist({ stage, locale }: { stage: CaseStage; locale: string }) {
  const t = await getTranslations("mijn-aankoop");
  return (
    <section className="case-panel journey-checklist" id="koopreis">
      <span className="section-kicker">{t("journeyKicker")}</span>
      <h2>{t("journeyTitle")}</h2>
      <p className="muted-copy">
        {t("journeyCopy")}
      </p>
      <ol className="journey-stage-list">
        {journeyChecklist(locale === "en" ? "en" : "nl").map((entry) => {
          const status = journeyStageStatus(entry.stage, stage);
          return (
            <li key={entry.stage} className={`journey-stage journey-stage-${status}`}>
              <details open={status === "current"}>
                <summary>
                  <span className={`journey-stage-dot ${status}`} />
                  <strong>{CASE_STAGE_LABELS[entry.stage]}</strong>
                  {status === "done" && <span className="journey-stage-tag">{t("journeyDoneTag")}</span>}
                  {status === "current" && <span className="journey-stage-tag">{t("journeyNowTag")}</span>}
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
