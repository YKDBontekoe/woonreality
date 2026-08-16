import { parseHTML } from "linkedom";
import { extractFundaListingFromDocument } from "@/src/lib/listing-extract-dom";
import { extractListingFacts } from "@/src/lib/listing-intake";
import {
  hasValue,
  type ImportedListingFacts,
} from "@/src/lib/listing-extract";

export function extractFundaListingFromHtml(html: string): ImportedListingFacts {
  const { document } = parseHTML(html);
  return extractFundaListingFromDocument(document as unknown as Document);
}

export function looksLikeListingHtml(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 40) return false;
  return /application\/ld\+json|<dl[\s>]|<dt[\s>]|__NEXT_DATA__|__NUXT_DATA__|itemscope|og:description/i.test(trimmed)
    || (/<[a-z][\s\S]{20,}>/i.test(trimmed) && /vraagprijs|woonoppervlakte|energielabel|funda/i.test(trimmed));
}

export function extractImportedListingPaste(value: string): ImportedListingFacts {
  const trimmed = value.trim();
  if (!trimmed) return { notes: [] };
  if (looksLikeListingHtml(trimmed)) {
    const facts = extractFundaListingFromHtml(trimmed);
    if (hasValue(facts.askingPrice) || hasValue(facts.livingAreaM2) || hasValue(facts.description) || hasValue(facts.roomCount)) {
      return facts;
    }
  }
  const textFacts = extractListingFacts(trimmed) as ImportedListingFacts;
  if (!textFacts.description && trimmed.length > 80 && !looksLikeListingHtml(trimmed)) {
    textFacts.description = trimmed.slice(0, 8_000);
  }
  return textFacts;
}
