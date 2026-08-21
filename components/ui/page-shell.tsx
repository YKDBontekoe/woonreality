import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";

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
    <main className={`site-shell ${className}`.trim()}>
      <div className="container">
        {showHeader ? <SiteHeader current={current} /> : null}
        {children}
      </div>
    </main>
  );
}
