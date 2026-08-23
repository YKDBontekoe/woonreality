import { redirect } from "next/navigation";
import { PurchaseCockpit } from "@/components/purchase-cockpit";
import { SiteHeader } from "@/components/site-header";
import { normalizeCaseStage } from "@/src/lib/journey";
import { parseOnboardingDismissed, shouldRedirectToOnboarding } from "@/src/lib/onboarding";
import { buyerProfileIsConfigured, EMPTY_BUYER_PROFILE, normalizeBuyerProfile } from "@/src/lib/purchase";
import { mortgageStateHasCapacity, restoreCalculatorState } from "@/src/lib/mortgage/calculator-state";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function MyPurchasePage({ searchParams }: { searchParams: Promise<{ case?: string; setup?: string }> }) {
  const params = await searchParams;
  if (params.case) redirect(`/mijn-aankoop/${params.case}`);
  const clientConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const configured = isSupabaseConfigured();
  let cases: { id: string; title: string; stage: string; status: string; updated_at: string; bagVboId: string | null }[] = [];
  let account: { email: string; emailConfirmed: boolean; suggestPasskey?: boolean } | null = null;

  if (clientConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) redirect("/login?next=/mijn-aankoop");
    account = { email: auth.user.email ?? "Je e-mailadres", emailConfirmed: Boolean(auth.user.email_confirmed_at), suggestPasskey: params.setup === "passkey" };
    if (configured) {
      const [casesResult, profileResult] = await Promise.all([
        supabase.from("purchase_cases").select("id,title,stage,status,updated_at,properties(bag_vbo_id)").eq("user_id", auth.user.id).order("updated_at", { ascending: false }),
        supabase.from("profiles").select("preferences_json").eq("id", auth.user.id).maybeSingle(),
      ]);
      if (profileResult.error) throw profileResult.error;
      const prefs = record(profileResult.data?.preferences_json);
      const buyerProfile = normalizeBuyerProfile(prefs.buyerProfile ?? EMPTY_BUYER_PROFILE);
      const mortgageState = prefs.mortgageState ? restoreCalculatorState(prefs.mortgageState) : null;
      if (shouldRedirectToOnboarding({
        mortgageConfigured: mortgageStateHasCapacity(mortgageState),
        buyerProfileConfigured: buyerProfileIsConfigured(buyerProfile, prefs.buyerProfile),
        onboardingDismissed: parseOnboardingDismissed(prefs),
      })) {
        redirect(params.setup === "passkey" ? "/onboarding?setup=passkey" : "/onboarding");
      }
      cases = (casesResult.data ?? []).map((row) => {
        const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
        return {
          id: row.id,
          title: row.title,
          stage: normalizeCaseStage(row.stage),
          status: row.status,
          updated_at: row.updated_at,
          bagVboId: property && typeof property === "object" && "bag_vbo_id" in property ? String(property.bag_vbo_id) : null,
        };
      });
    }
  }

  return <><div className="container"><SiteHeader current="aankoop" /></div><PurchaseCockpit initialCases={cases} account={account} /></>;
}
