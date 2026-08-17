import Link from "next/link";
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
  return (
    <nav className="dash-dock" aria-label="Volgende stappen">
      <Link className="primary-button" href={`/woning/${bagVboId}/bezichtiging`}>Bezichtiging</Link>
      <Link className="secondary-button" href={hypotheekHref}>Hypotheek</Link>
      {caseId ? (
        <Link className="secondary-button" href={`/mijn-aankoop/${caseId}`}>Dossier</Link>
      ) : (
        <StartCaseButton bagVboId={bagVboId} />
      )}
      <button className={`ghost-button ${isSaved ? "selected" : ""}`} type="button" onClick={onSave}>
        <Heart size={14} fill={isSaved ? "currentColor" : "none"} />
        {isSaved ? "Bewaard" : "Bewaar"}
      </button>
    </nav>
  );
}
