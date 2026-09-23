CREATE TABLE "share_links" (
	"token" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"views" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "share_links_brand_idx" ON "share_links" USING btree ("brand_id");