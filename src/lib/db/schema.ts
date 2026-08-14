import { index, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const properties = pgTable("properties", {
  id: uuid("id").defaultRandom().primaryKey(),
  bagVboId: varchar("bag_vbo_id", { length: 32 }).notNull().unique(),
  addressLabel: text("address_label").notNull(),
  postcode: varchar("postcode", { length: 12 }).notNull(),
  houseNumber: text("house_number").notNull(),
  houseNumberAddition: text("house_number_addition"),
  city: text("city").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  rdX: real("rd_x"),
  rdY: real("rd_y"),
  areaM2: real("area_m2"),
  buildYear: real("build_year"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const propertyBuildings = pgTable("property_buildings", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull(),
  bagPandId: varchar("bag_pand_id", { length: 32 }).notNull(),
  isPrimary: text("is_primary").notNull().default("true"),
});

export const sourceCache = pgTable("source_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  source: varchar("source", { length: 120 }).notNull(),
  cacheKey: text("cache_key").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  etag: text("etag"),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  schemaVersion: varchar("schema_version", { length: 32 }).notNull().default("1"),
}, (table) => ({ sourceCacheKey: uniqueIndex("source_cache_source_key_unique").on(table.source, table.cacheKey) }));

export const evidence = pgTable("evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull(),
  source: varchar("source", { length: 120 }).notNull(),
  sourceRecordId: text("source_record_id"),
  sourceUrl: text("source_url").notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  spatialResolution: text("spatial_resolution"),
  confidence: varchar("confidence", { length: 16 }).notNull(),
  caveat: text("caveat"),
  rawJson: jsonb("raw_json"),
});

export const analyses = pgTable("analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull(),
  analysisVersion: varchar("analysis_version", { length: 32 }).notNull(),
  scoringVersion: varchar("scoring_version", { length: 32 }).notNull(),
  overallScore: real("overall_score").notNull(),
  componentsJson: jsonb("components_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiReports = pgTable("ai_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyId: uuid("property_id").notNull(),
  reportVersion: varchar("report_version", { length: 32 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
  inputFingerprint: varchar("input_fingerprint", { length: 128 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  reportJson: jsonb("report_json"),
  sourceManifestJson: jsonb("source_manifest_json"),
  researchModel: varchar("research_model", { length: 80 }),
  synthesisModel: varchar("synthesis_model", { length: 80 }),
  usageJson: jsonb("usage_json"),
  errorCode: text("error_code"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  propertyReportVersion: uniqueIndex("ai_reports_property_report_version_unique").on(table.propertyId, table.reportVersion),
  propertyStatus: index("ai_reports_property_status_idx").on(table.propertyId, table.status),
}));
