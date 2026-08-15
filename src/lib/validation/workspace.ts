import { z } from "zod";

const propertyStageSchema = z.enum(["saved", "research", "viewing", "visited", "offer", "offered", "negotiation", "accepted", "dropped", "bought"]);
const preferencesSchema = z.object({
  quiet: z.number().finite().min(1).max(5),
  green: z.number().finite().min(1).max(5),
  energy: z.number().finite().min(1).max(5),
  mobility: z.number().finite().min(1).max(5),
  climate: z.number().finite().min(1).max(5),
  future: z.number().finite().min(1).max(5),
}).strict();
const buyerProfileSchema = z.object({
  budget: z.number().finite().nonnegative(),
  monthlyPayment: z.number().finite().nonnegative(),
  ownFunds: z.number().finite().nonnegative(),
  searchArea: z.string().max(160),
  bedrooms: z.number().int().min(0).max(20),
  garden: z.boolean(),
  parking: z.boolean(),
  remoteWork: z.boolean(),
}).strict();

export const workspaceBodySchema = z.object({
  action: z.enum(["save", "unsave", "stage", "compare", "profile"]),
  bagVboId: z.string().regex(/^\d{16}$/).optional(),
  addressLabel: z.string().min(1).max(240).optional(),
  city: z.string().min(1).max(120).optional(),
  postcode: z.string().min(1).max(12).optional(),
  stage: propertyStageSchema.optional(),
  preferences: preferencesSchema.optional(),
  buyerProfile: buyerProfileSchema.optional(),
  compare: z.array(z.string().regex(/^\d{16}$/)).max(4).optional(),
}).strict();

export type WorkspaceRequest = z.infer<typeof workspaceBodySchema>;
export const MAX_PREFERENCES_JSON_BYTES = 16_000;

export function preferencesJsonWithinLimit(value: unknown) {
  return JSON.stringify(value).length <= MAX_PREFERENCES_JSON_BYTES;
}

export const checklistItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(240),
  reason: z.string().max(500).optional(),
  signalKey: z.string().max(120).optional(),
  checked: z.boolean(),
  note: z.string().max(2_000).optional(),
}).strict();

export const checklistBodySchema = z.object({
  items: z.array(checklistItemSchema).max(100),
}).strict();

export const MAX_CHECKLIST_BODY_BYTES = 64_000;
