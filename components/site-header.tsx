import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteHeader({ current }: { current?: "home" | "aankoop" | "woning" | "hypotheek" }) {
  return (
    <header className="topbar">
      <Link href="/"><Brand /></Link>
      <nav className="nav">
        <Link href="/#werkwijze">Werkwijze</Link>
        <Link href="/hypotheek" className={current === "hypotheek" ? "nav-current" : undefined}>Hypotheek</Link>
        <Link href="/mijn-aankoop" className={current === "aankoop" ? "nav-current" : undefined}>Mijn aankoop</Link>
        <Link className="nav-cta" href="/#zoek-adres">{current === "home" ? "Check een adres" : "Nieuw adres"}</Link>
      </nav>
    </header>
  );
}
