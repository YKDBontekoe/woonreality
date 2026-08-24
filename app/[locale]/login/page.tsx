import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/src/lib/i18n/navigation";
import { AuthForm } from "@/components/auth-form";
import { PageShell } from "@/components/ui/page-shell";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "login" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function LoginPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string; next?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("login");
  const search = await searchParams;
  const initialMessage = search.error === "invalid-link" ? t("invalidLinkMessage") : "";
  const nextPath = search.next?.startsWith("/") && !search.next.startsWith("//") ? search.next : "";
  return (
    <PageShell current="login" className="auth-shell">
      <div className="auth-page">
        <Link className="back-link" href="/">{t("backToSearch")}</Link>
        <div className="eyebrow"><span className="eyebrow-dot" /> {t("eyebrow")}</div>
        <h1>{t("title")}</h1>
        <p className="hero-copy">
          {t("heroCopy")}
        </p>
        <AuthForm initialMessage={initialMessage} nextPath={nextPath} />
        <small>{t("noAccountNote")}</small>
      </div>
    </PageShell>
  );
}
