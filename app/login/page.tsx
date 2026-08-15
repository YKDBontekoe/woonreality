import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { SiteHeader } from "@/components/site-header";

export default function LoginPage() {
  return <main className="site-shell"><div className="container"><SiteHeader /></div><div className="container auth-page">
    <Link className="back-link" href="/">← Terug naar zoeken</Link>
    <div className="eyebrow"><span className="eyebrow-dot" /> jouw aankoopdossier</div>
    <h1>Bewaar je volgende stap.</h1>
    <p className="hero-copy">Log in zonder wachtwoord. Je woninganalyses, vragen en deadlines staan daarna op één plek.</p>
    <AuthForm />
    <small>Je gebruikt WoonReality ook zonder account. Een account is alleen nodig om een dossier en documenten te bewaren.</small>
  </div></main>;
}
