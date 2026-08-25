import { listingStorageKey, type UserListingDraft } from "@/src/lib/listing-intake";

export type WritableDraftKey = "askingPrice" | "sourceUrl" | "facts" | "blocked" | "notice";

export type WriteListingDraftOptions = {
  /** Keys to drop from the merged draft (e.g. clearing a stale notice after an unblocked re-import). */
  resetKeys?: WritableDraftKey[];
};

export function readListingDraft(bagId: string): UserListingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(listingStorageKey(bagId));
    return raw ? JSON.parse(raw) as UserListingDraft : null;
  } catch {
    return null;
  }
}

/**
 * Single merge rule for session drafts: every incoming key wins when present
 * (a newer observation), otherwise the existing draft value is kept — askingPrice
 * included. Pass resetKeys to delete keys that no longer apply.
 */
export function writeListingDraft(bagId: string, incoming: Partial<UserListingDraft>, options: WriteListingDraftOptions = {}): UserListingDraft | null {
  const existing = readListingDraft(bagId);
  const defined = Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined),
  ) as Partial<UserListingDraft>;
  const draft: UserListingDraft = {
    ...existing,
    ...defined,
    // askingPrice precedence: incoming (newer observation) wins when present, otherwise existing.
    askingPrice: incoming.askingPrice ?? existing?.askingPrice,
    bagVboId: bagId,
  };
  for (const key of options.resetKeys ?? []) {
    // An explicitly provided incoming value always beats a reset.
    if (!(key in defined)) delete draft[key];
  }
  if (typeof window === "undefined") return null;
  try {
    window.sessionStorage.setItem(listingStorageKey(bagId), JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}
