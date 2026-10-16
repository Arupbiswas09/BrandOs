CREATE TABLE "asset_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"name" text NOT NULL,
	"thumbnail" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "thumbnail" jsonb;--> statement-breakpoint
ALTER TABLE "links" ADD COLUMN "folder_id" text;--> statement-breakpoint
CREATE INDEX "asset_folders_offer_idx" ON "asset_folders" USING btree ("offer_id");