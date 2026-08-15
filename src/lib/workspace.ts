import type { PersonalPreferences, SavedProperty } from "@/src/lib/types";
import { DEFAULT_PREFERENCES } from "@/src/lib/personalization";
import { DEFAULT_BUYER_PROFILE, type BuyerProfile, type PropertyStage } from "@/src/lib/purchase";

export type WorkspaceData = {
  preferences: PersonalPreferences;
  preferencesConfigured: boolean;
  buyerProfile: BuyerProfile;
  buyerProfileConfigured: boolean;
  saved: SavedProperty[];
  compare: string[];
  propertyStages: Record<string, PropertyStage>;
};

export const emptyWorkspace = (): WorkspaceData => ({
  preferences: { ...DEFAULT_PREFERENCES },
  preferencesConfigured: false,
  buyerProfile: { ...DEFAULT_BUYER_PROFILE },
  buyerProfileConfigured: false,
  saved: [],
  compare: [],
  propertyStages: {},
});
