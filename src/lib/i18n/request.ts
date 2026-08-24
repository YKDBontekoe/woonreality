import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

const namespaces = [
  "common",
  "landing",
  "header",
  "footer",
  "home",
  "hypotheek",
  "kaart",
  "vergelijken",
  "extensie",
  "login",
  "onboarding",
  "mijn-aankoop",
  "woning",
  "plek",
  "errors",
  "metadata",
  "lib-domain",
  "lib-analysis",
  "lib-finance",
  "lib-api",
] as const;

async function loadMessages(locale: string) {
  const modules = await Promise.all(
    namespaces.map((namespace) =>
      import(`../../../messages/${locale}/${namespace}.json`).then((m) => [namespace, m.default] as const),
    ),
  );
  return Object.fromEntries(modules);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
