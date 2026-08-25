import type { ReactNode } from "react";
import { BackToTop } from "@/components/back-to-top";
import { CommandPalette } from "@/components/command-palette";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";

export type HeaderCurrent = "home" | "aankoop" | "woning" | "hypotheek" | "login" | "extensie" | "vergelijken" | "kaart";

export function PageShell({
  children,
  current,
  className = "",
  showHeader = true,
  wrap = true,
  containerClassName = "",
}: {
  children: ReactNode;
  current?: HeaderCurrent;
  className?: string;
  showHeader?: boolean;
  /** When false, the header gets its own container and children render
   * full-bleed (for pages composed of multiple .container sections). */
  wrap?: boolean;
  containerClassName?: string;
}) {
  const header = showHeader ? <SiteHeader current={current} /> : null;
  const footer = <SiteFooter />;
  const content = wrap ? (
    <div className={`container ${containerClassName}`.trim()}>
      {header}
      {children}
      <BackToTop />
      {footer}
    </div>
  ) : (
    <>
      {header ? <div className="container">{header}</div> : null}
      {children}
      <BackToTop />
      {footer}
    </>
  );
  return (
    <main id="hoofdinhoud" tabIndex={-1} className={`site-shell ${className}`.trim()}>
      <SkipLink />
      {content}
      <CommandPalette />
    </main>
  );
}
