"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Brand } from "@/components/brand";

export function SiteHeader({ current }: { current?: "home" | "aankoop" | "woning" | "hypotheek" | "login" }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <Link href="/" onClick={() => setMenuOpen(false)}><Brand /></Link>
      <nav className={`nav ${menuOpen ? "nav-open" : ""}`} aria-label="Hoofdmenu">
        <button
          className="nav-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="site-nav-links"
          aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div id="site-nav-links" className="nav-links">
          <Link href="/#werkwijze" onClick={() => setMenuOpen(false)}>Werkwijze</Link>
          <Link href="/hypotheek" className={current === "hypotheek" ? "nav-current" : undefined} onClick={() => setMenuOpen(false)}>Hypotheek</Link>
          <Link href="/mijn-aankoop" className={current === "aankoop" ? "nav-current" : undefined} onClick={() => setMenuOpen(false)}>Mijn aankoop</Link>
          <Link className="nav-cta" href="/#zoek-adres" onClick={() => setMenuOpen(false)}>
            {current === "home" ? "Check een adres" : "Nieuw adres"}
          </Link>
        </div>
      </nav>
    </header>
  );
}
