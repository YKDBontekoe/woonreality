CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"analysis_version" varchar(32) NOT NULL,
	"scoring_version" varchar(32) NOT NULL,
	"overall_score" real NOT NULL,
	"components_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"source" varchar(120) NOT NULL,
	"source_record_id" text,
	"source_url" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"spatial_resolution" text,
	"confidence" varchar(16) NOT NULL,
	"caveat" text,
	"raw_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bag_vbo_id" varchar(32) NOT NULL,
	"address_label" text NOT NULL,
	"postcode" varchar(12) NOT NULL,
	"house_number" text NOT NULL,
	"house_number_addition" text,
	"city" text NOT NULL,
	"lat" real NOT NULL,
	"lng" real NOT NULL,
	"rd_x" real,
	"rd_y" real,
	"area_m2" real,
	"build_year" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_bag_vbo_id_unique" UNIQUE("bag_vbo_id")
);
--> statement-breakpoint
CREATE TABLE "property_buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"bag_pand_id" varchar(32) NOT NULL,
	"is_primary" text DEFAULT 'true' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(120) NOT NULL,
	"cache_key" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"etag" text,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"schema_version" varchar(32) DEFAULT '1' NOT NULL
);
