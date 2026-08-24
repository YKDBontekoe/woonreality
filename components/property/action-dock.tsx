import { useTranslations } from "next-intl";
import { Link } from "@/src/lib/i18n/navigation";
import type { Route } from "next";
import { Heart } from "lucide-react";
import { StartCaseButton } from "@/components/start-case-button";

export function PropertyActionDock({
  bagVboId,
  hypotheekHref,
  caseId,
  isSaved,
  onSave,
}: {
  bagVboId: string;
  hypotheekHref: Route;
  caseId: string | null;
  isSaved: boolean;
  onSave: () => void;
}) {
  const t = useTranslations("woning");
  return (
    <nav className="dash-dock" aria-label={t("actionDock.nextSteps")}>
      <Link className="primary-button" href={`/woning/${bagVboId}/bezichtiging`}>{t("actionDock.viewingLink")}</Link>
      <Link className="secondary-button" href={hypotheekHref}>{t("actionDock.mortgageLink")}</Link>
      {caseId ? (
        <Link className="secondary-button" href={`/mijn-aankoop/${caseId}`}>{t("actionDock.caseFile")}</Link>
      ) : (
        <StartCaseButton bagVboId={bagVboId} />
      )}
      <button className={`ghost-button ${isSaved ? "selected" : ""}`} type="button" onClick={onSave}>
        <Heart size={14} fill={isSaved ? "currentColor" : "none"} />
        {isSaved ? t("saved") : t("save")}
      </button>
    </nav>
  );
}
