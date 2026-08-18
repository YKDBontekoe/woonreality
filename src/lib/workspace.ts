import type { ListingHistoryItem } from "@/src/lib/listing-history";
import type { PersonalPreferences, SavedProperty } from "@/src/lib/types";
import { DEFAULT_PREFERENCES } from "@/src/lib/personalization";
import { EMPTY_BUYER_PROFILE, type BuyerProfile, type PropertyStage } from "@/src/lib/purchase";
import type { CalculatorState, MortgageSnapshot } from "@/src/lib/mortgage/calculator-state";

export type { ListingHistoryItem };

export type WorkspaceData = {
  preferences: PersonalPreferences;
  preferencesConfigured: boolean;
  buyerProfile: BuyerProfile;
  buyerProfileConfigured: boolean;
  mortgageState: CalculatorState | null;
  mortgageSnapshot: MortgageSnapshot | null;
  mortgageConfigured: boolean;
  onboardingDismissed: boolean;
  saved: SavedProperty[];
  listingHistory: ListingHistoryItem[];
  compare: string[];
  propertyStages: Record<string, PropertyStage>;
  askingPrices: Record<string, number>;
};

export const emptyWorkspace = (): WorkspaceData => ({
  preferences: { ...DEFAULT_PREFERENCES },
  preferencesConfigured: false,
  buyerProfile: { ...EMPTY_BUYER_PROFILE },
  buyerProfileConfigured: false,
  mortgageState: null,
  mortgageSnapshot: null,
  mortgageConfigured: false,
  onboardingDismissed: false,
  saved: [],
  listingHistory: [],
  compare: [],
  propertyStages: {},
  askingPrices: {},
});
