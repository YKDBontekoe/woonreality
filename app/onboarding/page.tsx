import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { SiteHeader } from "@/components/site-header";
import { onboardingComplete, parseOnboardingDismissed } from "@/src/lib/onboarding";
import { buyerProfileIsConfigured, EMPTY_BUYER_PROFILE, normalizeBuyerProfile } from "@/src/lib/purchase";
import { mortgageStateHasCapacity, restoreCalculatorState } from "@/src/lib/mortgage/calculator-state";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

export const metadata = {
  title: "Onboarding — WoonReality",
  description: "Stel je koopkracht, woonwensen en prioriteiten in voor je aankoopomgeving.",
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const params = await searchParams;
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
        redirect(params.setup === "passkey" ? "/mijn-aankoop?setup=passkey" : "/mijn-aankoop");
      }
    }
  } else {
    redirect("/login?next=/onboarding");
  }

  return (
    <main className="site-shell onboarding-product-shell">
      <div className="container"><SiteHeader current="aankoop" /></div>
      <div className="container onboarding-page">
        <OnboardingWizard suggestPasskey={params.setup === "passkey"} />
      </div>
    </main>
  );
}
