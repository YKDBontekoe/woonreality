/**
 * Login link that preserves where the visitor was, so the post-login
 * redirect (via /auth/callback?next=…) returns them to the same page
 * instead of dumping everyone into the onboarding wizard.
 */
export function loginHref() {
  if (typeof window === "undefined") return "/login";
  const current = `${window.location.pathname}${window.location.search}`;
  return current === "/" || current.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(current)}`;
}
