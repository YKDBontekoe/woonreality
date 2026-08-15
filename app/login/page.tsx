import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const initialMessage = params.error === "invalid-link" ? "Deze inloglink is verlopen of niet geldig. Vraag een nieuwe link aan." : "";
  return <main className="site-shell"><div className="container auth-page">
    <Link className="back-link" href="/">← Terug naar zoeken</Link>
    <div className="eyebrow"><span className="eyebrow-dot" /> jouw aankoopdossier</div>
    <h1>Bewaar je volgende stap.</h1>
    <p className="hero-copy">Log veilig in met een bevestigde e-mail of een passkey. Je woninganalyses, vragen en deadlines staan daarna op één plek.</p>
    <AuthForm initialMessage={initialMessage} />
    <small>Je gebruikt WoonReality ook zonder account. Een account is alleen nodig om een dossier, documenten en persoonlijke voortgang te bewaren.</small>
  </div></main>;
}
