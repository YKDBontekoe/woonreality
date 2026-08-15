import { redirect } from "next/navigation";
import { PurchaseCockpit } from "@/components/purchase-cockpit";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";

export default async function MyPurchasePage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  let cases: { id: string; title: string; stage: string; status: string; updated_at: string }[] = [];

  if (configured) {
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) redirect("/login");
    const { data } = await supabase.from("purchase_cases").select("id,title,stage,status,updated_at").eq("user_id", auth.user.id).order("updated_at", { ascending: false });
    cases = data ?? [];
  }

  return <><div className="container"><SiteHeader /></div>{configured && <div className="container cockpit-account"><SignOutButton /></div>}<PurchaseCockpit initialCases={cases} focusCase={params.case} /></>;
}
