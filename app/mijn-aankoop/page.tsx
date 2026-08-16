import { redirect } from "next/navigation";
import { PurchaseCockpit } from "@/components/purchase-cockpit";
import { SignOutButton } from "@/components/sign-out-button";
import { PasskeySettings } from "@/components/passkey-settings";
import { SiteHeader } from "@/components/site-header";
import { normalizeCaseStage } from "@/src/lib/journey";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

export default async function MyPurchasePage({ searchParams }: { searchParams: Promise<{ case?: string; setup?: string }> }) {
  const params = await searchParams;
  if (params.case) redirect(`/mijn-aankoop/${params.case}`);
  const clientConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const configured = isSupabaseConfigured();
  let cases: { id: string; title: string; stage: string; status: string; updated_at: string; bagVboId: string | null }[] = [];
  let account: { email: string; emailConfirmed: boolean } | null = null;

  if (clientConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) redirect("/login");
    account = { email: auth.user.email ?? "Je e-mailadres", emailConfirmed: Boolean(auth.user.email_confirmed_at) };
    if (configured) {
      const { data } = await supabase.from("purchase_cases").select("id,title,stage,status,updated_at,properties(bag_vbo_id)").eq("user_id", auth.user.id).order("updated_at", { ascending: false });
      cases = (data ?? []).map((row) => {
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

  return <><div className="container"><SiteHeader current="aankoop" /></div>{account && <><div className="container cockpit-account"><SignOutButton /></div><div className="container"><PasskeySettings email={account.email} emailConfirmed={account.emailConfirmed} suggestEnrollment={params.setup === "passkey"} /></div></>}<PurchaseCockpit initialCases={cases} /></>;
}
