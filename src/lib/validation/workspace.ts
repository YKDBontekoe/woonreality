import { z } from "zod";
import { CASE_STAGES } from "@/src/lib/journey";

const propertyStageSchema = z.enum(["saved", "research", "viewing", "visited", "offer", "offered", "negotiation", "accepted", "dropped", "bought"]);
const preferencesSchema = z.object({
  quiet: z.number().finite().min(1).max(5),
  green: z.number().finite().min(1).max(5),
  energy: z.number().finite().min(1).max(5),
  mobility: z.number().finite().min(1).max(5),
  climate: z.number().finite().min(1).max(5),
  future: z.number().finite().min(1).max(5),
}).strict();
export const buyerProfileSchema = z.object({
  budget: z.number().finite().nonnegative(),
  monthlyPayment: z.number().finite().nonnegative(),
  ownFunds: z.number().finite().nonnegative(),
  searchArea: z.string().max(160),
  bedrooms: z.number().int().min(0).max(20),
  garden: z.boolean(),
  parking: z.boolean(),
  remoteWork: z.boolean(),
  household: z.enum(["single", "couple", "family"]),
  householdSpecified: z.boolean().optional(),
  propertyType: z.enum(["any", "house", "apartment"]),
  firstTimeBuyer: z.boolean(),
  buyerAge: z.number().int().min(0).max(120).optional(),
  selfOccupied: z.boolean().optional(),
  priorExemptionUsed: z.boolean().optional(),
  nhg: z.boolean(),
  acceptVve: z.boolean(),
  maxCommuteMinutes: z.number().int().min(0).max(240),
}).strict();

const yearTripleSchema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const personFormSchema = z.object({
  workType: z.enum(["permanent", "temporary", "flex", "self_employed", "dga", "pension", "mix"]),
  reachedAow: z.boolean(),
  incomeEntry: z.enum(["monthly", "annual"]),
  monthlyGross: z.number().finite().nonnegative(),
  holidayMode: z.enum(["standard", "included", "custom"]),
  holidayCustom: z.number().finite().nonnegative(),
  hasThirteenth: z.boolean(),
  yearEndPayout: z.number().finite().nonnegative(),
  monthlyAllowances: z.number().finite().nonnegative(),
  structuralBonus: z.number().finite().nonnegative(),
  variableBonus: yearTripleSchema,
  grossAnnual: z.number().finite().nonnegative(),
  thirteenthMonth: z.number().finite().nonnegative(),
  bonus: z.number().finite().nonnegative(),
  intent: z.boolean(),
  perspectief: z.boolean(),
  history: yearTripleSchema,
  monthsActive: z.number().finite().nonnegative(),
  profits: yearTripleSchema,
  box1: yearTripleSchema,
  dividend: yearTripleSchema,
  pensionAnnual: z.number().finite().nonnegative(),
  alimonyAnnual: z.number().finite().nonnegative(),
}).strict();

export const mortgageStateSchema = z.object({
  withPartner: z.boolean(),
  applicant: personFormSchema,
  partner: personFormSchema,
  studentLoanMonthly: z.number().finite().nonnegative(),
  studentLoanRemaining: z.number().finite().nonnegative(),
  studentLoanSf35: z.boolean(),
  privateLeaseMonthly: z.number().finite().nonnegative(),
  revolvingCreditLimit: z.number().finite().nonnegative(),
  installmentLoanMonthly: z.number().finite().nonnegative(),
  groundLeaseMonthly: z.number().finite().nonnegative(),
  otherMonthlyDebts: z.number().finite().nonnegative(),
  alimonyPaidMonthly: z.number().finite().nonnegative(),
  savings: z.number().finite().nonnegative(),
  gift: z.number().finite().nonnegative(),
  saleEquity: z.number().finite().nonnegative(),
  nhg: z.boolean(),
  interestRate: z.number().finite().nonnegative().max(30),
  rateTouched: z.boolean(),
  fixedPeriodYears: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30)]),
  repayment: z.enum(["annuity", "linear"]),
  energyLabel: z.string().max(12),
  askingPrice: z.number().finite().nonnegative(),
  includeEnergyMeasures: z.boolean(),
  energyPerformanceGuarantee: z.boolean(),
  starterExemption: z.boolean(),
  buyerAge: z.number().int().min(0).max(120),
}).strict();

export const workspaceBodySchema = z.object({
  action: z.enum(["save", "unsave", "stage", "compare", "profile", "mortgage", "listingPrice", "onboarding"]),
  bagVboId: z.string().regex(/^\d{16}$/).optional(),
  addressLabel: z.string().min(1).max(240).optional(),
  city: z.string().min(1).max(120).optional(),
  postcode: z.string().min(1).max(12).optional(),
  stage: propertyStageSchema.optional(),
  preferences: preferencesSchema.optional(),
  buyerProfile: buyerProfileSchema.optional(),
  mortgageState: mortgageStateSchema.optional(),
  askingPrice: z.number().finite().nonnegative().nullable().optional(),
  compare: z.array(z.string().regex(/^\d{16}$/)).max(4).optional(),
  dismissOnboarding: z.boolean().optional(),
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

export const caseStageSchema = z.enum(CASE_STAGES);

export const workflowBodySchema = z.object({
  askingPrice: z.number().finite().nonnegative().nullable().optional(),
  offerAmount: z.number().finite().nonnegative().nullable().optional(),
  financingAmount: z.number().finite().nonnegative().nullable().optional(),
  contractAmount: z.number().finite().nonnegative().nullable().optional(),
  transferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  financingCondition: z.boolean().optional(),
  inspectionCondition: z.boolean().optional(),
  scenario: z.enum(["cautious", "balanced", "strong"]).optional(),
  reasons: z.array(z.string().max(240)).max(8).optional(),
  stage: caseStageSchema.optional(),
  /** Datum waarop de ondertekende koopovereenkomst door de koper is ontvangen; start van de wettelijke bedenktijd (Art. 7:2 BW). */
  contractReceivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Datum waarop (de laatste partij van) de koopovereenkomst is ondertekend; start van ontbindende-voorwaarden-termijnen. */
  contractSignedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Aantal weken voorbehoud van financiering vanaf contractSignedAt, zoals afgesproken in de koopovereenkomst. */
  financingWeeks: z.number().finite().min(0).max(52).nullable().optional(),
  /** Aantal weken voorbehoud van bouwkundige keuring vanaf contractSignedAt. */
  inspectionWeeks: z.number().finite().min(0).max(52).nullable().optional(),
}).strict();

export const userListingBodySchema = z.object({
  askingPrice: z.number().finite().nonnegative().nullable().optional(),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  pastedText: z.string().max(100_000).nullable().optional(),
}).strict();

export const userListingImportBodySchema = z.object({
  sourceUrl: z.string().url().max(500),
}).strict();

export const viewingDebriefSchema = z.object({
  decision: z.enum(["continue", "doubt", "drop"]),
  caseId: z.string().uuid().optional(),
}).strict();
