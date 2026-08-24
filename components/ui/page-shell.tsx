import type { ReactNode } from "react";
import { BackToTop } from "@/components/back-to-top";
import { CommandPalette } from "@/components/command-palette";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";

export type HeaderCurrent = "home" | "aankoop" | "woning" | "hypotheek" | "login" | "extensie" | "vergelijken" | "kaart";

export function PageShell({
  children,
  current,
  className = "",
  showHeader = true,
}: {
  children: ReactNode;
  current?: HeaderCurrent;
  className?: string;
  showHeader?: boolean;
}) {
  return (
    <main id="hoofdinhoud" tabIndex={-1} className={`site-shell ${className}`.trim()}>
      <SkipLink />
      <div className="container">
        {showHeader ? <SiteHeader current={current} /> : null}
        {children}
        <BackToTop />
      </div>
      <CommandPalette />
    </main>
  );
}
