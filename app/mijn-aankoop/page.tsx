import { redirect } from "next/navigation";
import { PurchaseCockpit } from "@/components/purchase-cockpit";
import { SignOutButton } from "@/components/sign-out-button";
import { PasskeySettings } from "@/components/passkey-settings";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

export default async function MyPurchasePage({ searchParams }: { searchParams: Promise<{ case?: string; setup?: string }> }) {
  const params = await searchParams;
  const clientConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const configured = isSupabaseConfigured();
  let cases: { id: string; title: string; stage: string; status: string; updated_at: string }[] = [];
  let account: { email: string; emailConfirmed: boolean } | null = null;

  if (clientConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) redirect("/login");
    account = { email: auth.user.email ?? "Je e-mailadres", emailConfirmed: Boolean(auth.user.email_confirmed_at) };
    if (configured) {
      const { data } = await supabase.from("purchase_cases").select("id,title,stage,status,updated_at").eq("user_id", auth.user.id).order("updated_at", { ascending: false });
      cases = data ?? [];
    }
  }

  return <><div className="container"><SiteHeader /></div>{account && <><div className="container cockpit-account"><SignOutButton /></div><div className="container"><PasskeySettings email={account.email} emailConfirmed={account.emailConfirmed} suggestEnrollment={params.setup === "passkey"} /></div></>}<PurchaseCockpit initialCases={cases} focusCase={params.case} /></>;
}
