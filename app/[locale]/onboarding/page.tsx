import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { PageShell } from "@/components/ui/page-shell";
import { onboardingComplete, parseOnboardingDismissed } from "@/src/lib/onboarding";
import { buyerProfileIsConfigured, EMPTY_BUYER_PROFILE, normalizeBuyerProfile } from "@/src/lib/purchase";
import { mortgageStateHasCapacity, restoreCalculatorState } from "@/src/lib/mortgage/calculator-state";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function OnboardingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ setup?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const clientConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (clientConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) redirect("/login?next=/onboarding");

    if (isSupabaseConfigured()) {
      const { data: profile, error: profileError } = await supabase.from("profiles").select("preferences_json").eq("id", auth.user.id).maybeSingle();
      if (profileError) throw profileError;
      const prefs = record(profile?.preferences_json);
      const buyerProfile = normalizeBuyerProfile(prefs.buyerProfile ?? EMPTY_BUYER_PROFILE);
      const mortgageState = prefs.mortgageState ? restoreCalculatorState(prefs.mortgageState) : null;
      const gate = {
        mortgageConfigured: mortgageStateHasCapacity(mortgageState),
        buyerProfileConfigured: buyerProfileIsConfigured(buyerProfile, prefs.buyerProfile),
        onboardingDismissed: parseOnboardingDismissed(prefs),
      };
      if (onboardingComplete(gate)) {
        redirect(search.setup === "passkey" ? "/mijn-aankoop?setup=passkey" : "/mijn-aankoop");
      }
    }
  } else {
    redirect("/login?next=/onboarding");
  }

  return (
    <PageShell current="aankoop" className="onboarding-product-shell" wrap={false}>
      <div className="container onboarding-page">
        <OnboardingWizard suggestPasskey={search.setup === "passkey"} />
      </div>
    </PageShell>
  );
}
