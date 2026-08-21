"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import type { HeaderCurrent } from "@/components/ui/page-shell";

export function SiteHeader({ current }: { current?: HeaderCurrent }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuToggleRef.current?.focus();
    };
    const trapMenuFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(navRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("keydown", trapMenuFocus);
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (navRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("keydown", trapMenuFocus);
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [menuOpen]);

  return (
    <header className="topbar">
      <Link href="/" onClick={() => setMenuOpen(false)}><Brand /></Link>
      <nav ref={navRef} className={`nav ${menuOpen ? "nav-open" : ""}`} aria-label="Hoofdmenu">
        <button
          className="nav-menu-toggle"
          type="button"
          ref={menuToggleRef}
          aria-expanded={menuOpen}
          aria-controls="site-nav-links"
          aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div id="site-nav-links" className="nav-links">
          <Link href="/#werkwijze" onClick={() => setMenuOpen(false)}>Werkwijze</Link>
          <Link href="/hypotheek" className={current === "hypotheek" ? "nav-current" : undefined} aria-current={current === "hypotheek" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Hypotheek</Link>
          <Link href="/kaart" className={current === "kaart" ? "nav-current" : undefined} aria-current={current === "kaart" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Kaart</Link>
          <Link href="/vergelijken" className={current === "vergelijken" ? "nav-current" : undefined} aria-current={current === "vergelijken" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Vergelijken</Link>
          <Link href="/extensie" className={current === "extensie" ? "nav-current" : undefined} aria-current={current === "extensie" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Extensie</Link>
          <Link href="/mijn-aankoop" className={current === "aankoop" ? "nav-current" : undefined} aria-current={current === "aankoop" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Mijn aankoop</Link>
          <Link className="nav-cta" href="/#zoek-adres" onClick={() => setMenuOpen(false)}>
            Adres zoeken
          </Link>
        </div>
      </nav>
    </header>
  );
}
