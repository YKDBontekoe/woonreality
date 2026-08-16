import {
  applyEmbeddedJsonText,
  applyJsonLdText,
  applyKenmerk,
  finalizeExtractedFacts,
  factsFromFundaUrl,
  isFundaChallengeHtml,
  mergeListingFacts,
  type ImportedListingFacts,
  type ListingTextSection,
} from "@/src/lib/listing-extract";

const TEXT_HEADINGS = /^(omschrijving|indeling|buurt|omgeving|bijzonderheden|kenmerken|overdracht|uitrusting|tuin|buitenruimte|wat je moet weten|ligt|ligging)$/i;
const NEIGHBORHOOD_HEADINGS = /^(buurt|omgeving|wijk|ligging)/i;

function textOf(node: Element | null | undefined) {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function kenmerkPairs(doc: Document) {
  const pairs: Array<[string, string]> = [];
  for (const dt of Array.from(doc.querySelectorAll("dt"))) {
    let sibling = dt.nextElementSibling;
    while (sibling && sibling.tagName !== "DD" && sibling.tagName !== "DT") sibling = sibling.nextElementSibling;
    if (sibling?.tagName === "DD") {
      const label = textOf(dt);
      const value = textOf(sibling);
      if (label && value) pairs.push([label, value]);
    }
  }
  for (const row of Array.from(doc.querySelectorAll("tr"))) {
    const cells = Array.from(row.children).filter((el) => el.tagName === "TH" || el.tagName === "TD");
    if (cells.length >= 2) pairs.push([textOf(cells[0] as Element), textOf(cells[1] as Element)]);
  }
  return pairs;
}

function extractFreeText(doc: Document): { description?: string; neighborhood?: string; sections: ListingTextSection[] } {
  const sections: ListingTextSection[] = [];
  for (const heading of Array.from(doc.querySelectorAll("h2, h3"))) {
    const title = textOf(heading);
    if (!title || title.length > 80) continue;
    const parts: string[] = [];
    let cursor = heading.nextElementSibling;
    while (cursor && !/^(H1|H2|H3|NAV|FOOTER)$/.test(cursor.tagName)) {
      const tag = cursor.tagName;
      if (tag === "P" || tag === "DIV" || tag === "SECTION" || tag === "LI") {
        const text = textOf(cursor);
        if (text.length > 40 && !/cookie|javascript|recaptcha/i.test(text)) parts.push(text);
      }
      cursor = cursor.nextElementSibling;
    }
    const unique = [...new Set(parts.map((item) => item.trim()).filter(Boolean))];
    const text = unique.join("\n\n").slice(0, 4_000);
    if (text.length > 80) sections.push({ title, text });
  }
  const og = doc.querySelector('meta[property="og:description"]')?.getAttribute("content")?.replace(/\s+/g, " ").trim();
  const meta = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.replace(/\s+/g, " ").trim();
  const named = sections.find((section) => TEXT_HEADINGS.test(section.title))?.text
    ?? [...sections].sort((a, b) => b.text.length - a.text.length)[0]?.text;
  const description = [named, og, meta].find((value) => value && value.length > 40)?.slice(0, 8_000);
  const neighborhood = sections.find((section) => NEIGHBORHOOD_HEADINGS.test(section.title))?.text.slice(0, 4_000);
  return { description, neighborhood, sections: sections.slice(0, 12) };
}

export function isFundaChallengeDocument(doc: Document) {
  const hasLd = Boolean(doc.querySelector('script[type="application/ld+json"]'));
  if (hasLd) return false;
  const sample = `${doc.title ?? ""}\n${doc.body?.innerHTML?.slice(0, 8_000) ?? ""}`;
  return isFundaChallengeHtml(sample);
}

export function extractFundaListingFromDocument(doc: Document, sourceUrl?: string): ImportedListingFacts {
  const facts: ImportedListingFacts = { notes: [] };
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    applyJsonLdText(script.textContent ?? "", facts);
  }
  for (const script of Array.from(doc.querySelectorAll('script#__NEXT_DATA__, script#__NUXT_DATA__, script[type="application/json"]'))) {
    applyEmbeddedJsonText(script.textContent ?? "", facts);
  }
  for (const [label, value] of kenmerkPairs(doc)) applyKenmerk(label, value, facts);
  const free = extractFreeText(doc);
  if (free.description) facts.description ??= free.description;
  if (free.neighborhood) facts.neighborhood ??= free.neighborhood;
  if (free.sections.length) facts.sections = free.sections;
  const visible = (doc.querySelector("main")?.textContent || doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  const merged = finalizeExtractedFacts(facts, visible);
  if (sourceUrl) return mergeListingFacts(merged, factsFromFundaUrl(sourceUrl));
  return merged;
}
