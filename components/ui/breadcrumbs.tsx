import type { Route } from "next";
import { useTranslations } from "next-intl";
import { Link } from "@/src/lib/i18n/navigation";

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = useTranslations("common");
  const crumbs: Crumb[] = [{ href: "/", label: t("breadcrumbHome") }, ...items];
  return (
    <nav className="breadcrumbs" aria-label={t("breadcrumbsAria")}>
      <ol>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`}>
              {crumb.href && !last ? (
                <Link href={crumb.href as Route}>{crumb.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
