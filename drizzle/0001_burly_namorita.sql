CREATE TABLE "ai_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"report_version" varchar(32) NOT NULL,
	"prompt_version" varchar(32) NOT NULL,
	"input_fingerprint" varchar(128) NOT NULL,
	"status" varchar(24) NOT NULL,
	"report_json" jsonb,
	"source_manifest_json" jsonb,
	"research_model" varchar(80),
	"synthesis_model" varchar(80),
	"usage_json" jsonb,
	"error_code" text,
	"generated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_reports_property_report_version_unique" ON "ai_reports" USING btree ("property_id","report_version");--> statement-breakpoint
CREATE INDEX "ai_reports_property_status_idx" ON "ai_reports" USING btree ("property_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "source_cache_source_key_unique" ON "source_cache" USING btree ("source","cache_key");