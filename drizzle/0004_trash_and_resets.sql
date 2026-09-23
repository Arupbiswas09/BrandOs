CREATE TABLE "trash" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"label" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"rows" jsonb NOT NULL,
	"deleted_by" text,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "purpose" text DEFAULT 'invite' NOT NULL;--> statement-breakpoint
CREATE INDEX "trash_deleted_idx" ON "trash" USING btree ("deleted_at");