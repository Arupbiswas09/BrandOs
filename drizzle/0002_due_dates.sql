ALTER TABLE "assets" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "due_at" timestamp with time zone;