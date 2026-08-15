"use client";

import { createSupabaseBrowserClient } from "@/src/lib/supabase/browser";

export function SignOutButton() {
  return <button className="secondary-button" type="button" onClick={() => createSupabaseBrowserClient().auth.signOut().then(() => { window.location.href = "/"; })}>Uitloggen</button>;
}
