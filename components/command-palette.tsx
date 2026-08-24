"use client";

import { Home as HomeIcon, Calculator, Map, GitCompareArrows, Puzzle, ShoppingCart } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/src/lib/i18n/navigation";
import { useEffect, useRef, useState } from "react";
import { AddressSearch } from "@/components/address-search";

type PalettePage = {
  href: string;
  labelKey: "home" | "hypotheek" | "kaart" | "vergelijken" | "extensie" | "mijnAankoop";
  icon: React.ReactNode;
};

const pages: PalettePage[] = [
  { href: "/", labelKey: "home", icon: <HomeIcon size={15} /> },
  { href: "/hypotheek", labelKey: "hypotheek", icon: <Calculator size={15} /> },
  { href: "/kaart", labelKey: "kaart", icon: <Map size={15} /> },
  { href: "/vergelijken", labelKey: "vergelijken", icon: <GitCompareArrows size={15} /> },
  { href: "/extensie", labelKey: "extensie", icon: <Puzzle size={15} /> },
  { href: "/mijn-aankoop", labelKey: "mijnAankoop", icon: <ShoppingCart size={15} /> },
];

export function CommandPalette() {
  const t = useTranslations("common");
  const tHeader = useTranslations("header");
  const router = useRouter();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = "hidden";
    const previousActive = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      document.documentElement.style.overflow = "";
      previousActive?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
    setQuery("");
  }, [pathname]);

  if (!open) return null;

  const normalizedQuery = query.trim().toLowerCase();
  const visiblePages = pages.filter((page) => !normalizedQuery
    || tHeader(page.labelKey).toLowerCase().includes(normalizedQuery)
    || page.href.toLowerCase().includes(normalizedQuery));

  function close() {
    setOpen(false);
    setQuery("");
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  return (
    <div className="cmdk-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        ref={dialogRef}
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label={t("paletteTitle")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <AddressSearch id="zoek-adres-cmdk" enableShortcuts={false} />
        <nav className="cmdk-nav" aria-label={t("palettePages")}>
          <p className="cmdk-nav-title">{t("palettePages")}</p>
          {visiblePages.length === 0 && (
            <p className="cmdk-empty">{t("paletteEmpty")}</p>
          )}
          {visiblePages.map((page) => (
            <button key={page.href} type="button" className="cmdk-item" onClick={() => go(page.href)}>
              <span className="cmdk-item-icon" aria-hidden="true">{page.icon}</span>
              {tHeader(page.labelKey)}
            </button>
          ))}
        </nav>
        <p className="cmdk-hint">
          <kbd>esc</kbd> {t("paletteClose")} · <kbd>↵</kbd> {t("paletteOpenHint")}
        </p>
      </div>
    </div>
  );
}
