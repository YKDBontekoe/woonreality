import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteHeader() {
  return <header className="topbar"><Link href="/"><Brand /></Link><nav className="nav"><a href="#werkwijze">Werkwijze</a><a href="#bronnen">Bronnen</a><Link className="nav-cta" href="/#zoek-adres">Check een adres</Link></nav></header>;
}
