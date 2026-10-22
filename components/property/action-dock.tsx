import { useTranslations } from "next-intl";
import { Link } from "@/src/lib/i18n/navigation";
import type { Route } from "next";
import { Printer } from "lucide-react";
import { StartCaseButton } from "@/components/start-case-button";

export function PropertyActionDock({
  bagVboId,
  hypotheekHref,
  caseId,
}: {
  bagVboId: string;
  hypotheekHref: Route;
  caseId: string | null;
}) {
  const t = useTranslations("woning");
  return (
    <nav className="dash-dock" aria-label={t("actionDock.nextSteps")}>
      <Link className="primary-button" href={`/woning/${bagVboId}/bezichtiging`}>{t("actionDock.viewingLink")}</Link>
      <Link className="secondary-button" href={hypotheekHref}>{t("actionDock.mortgageLink")}</Link>
      <Link className="secondary-button" href={`/woning/${bagVboId}/rapport`}><Printer size={14} /> {t("actionDock.reportLink")}</Link>
      {caseId ? (
        <Link className="secondary-button" href={`/mijn-aankoop/${caseId}`}>{t("actionDock.caseFile")}</Link>
      ) : (
        <StartCaseButton bagVboId={bagVboId} />
      )}
    </nav>
  );
}
