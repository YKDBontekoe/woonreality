import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Inloggen — WoonReality",
  description: "Log veilig in met e-mail of een passkey.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const initialMessage = params.error === "invalid-link" ? "Deze inloglink is verlopen of niet geldig. Vraag hieronder een nieuwe link aan." : "";
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "";
  return (
    <PageShell current="login" className="auth-shell">
      <div className="auth-page">
        <Link className="back-link" href="/">← Terug naar zoeken</Link>
        <div className="eyebrow"><span className="eyebrow-dot" /> account</div>
        <h1>Inloggen</h1>
        <p className="hero-copy">
          Log veilig in met e-mail of een passkey — geen wachtwoord nodig. Zo bewaar je woningen, vragen en deadlines op één plek.
        </p>
        <AuthForm initialMessage={initialMessage} nextPath={nextPath} />
        <small>Je gebruikt WoonReality ook zonder account. Een account is alleen nodig om een dossier, documenten en persoonlijke voortgang te bewaren.</small>
      </div>
    </PageShell>
  );
}
