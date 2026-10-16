CREATE TABLE "file_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"replaced_by_key" text,
	"file" jsonb NOT NULL,
	"replaced_by" text,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_results" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"ended_on" timestamp with time zone,
	"leads" integer,
	"calls" integer,
	"conversions" integer,
	"spend" real,
	"lesson" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stars" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "link_check" jsonb;--> statement-breakpoint
CREATE INDEX "file_versions_asset_idx" ON "file_versions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "offer_results_offer_idx" ON "offer_results" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stars_user_item_idx" ON "stars" USING btree ("user_id","kind","item_id");