CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"type" text NOT NULL,
	"item_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"field" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"channel" text DEFAULT 'Owned' NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"review" text DEFAULT 'None' NOT NULL,
	"reviewer_id" text,
	"change_note" text DEFAULT '' NOT NULL,
	"owner_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"short" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"copy" jsonb,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specs" text DEFAULT '' NOT NULL,
	"audience_notes" text DEFAULT '' NOT NULL,
	"ai_prompt" text DEFAULT '' NOT NULL,
	"cta_id" text,
	"client_visible" boolean DEFAULT false NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"cloned_from_id" text,
	"gated" boolean DEFAULT false NOT NULL,
	"delivery" text DEFAULT 'None' NOT NULL,
	"items" jsonb,
	"prompt_for" text DEFAULT '' NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"mark" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"primary_color" text DEFAULT '#2D4A5C' NOT NULL,
	"secondary_color" text DEFAULT '#7BA0A8' NOT NULL,
	"owner_id" text,
	"team_size" integer DEFAULT 1 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"voice" text DEFAULT '' NOT NULL,
	"boilerplate" text DEFAULT '' NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fonts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guidelines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"contact_id" text,
	"since" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"is_change" boolean DEFAULT false NOT NULL,
	"refs" text[] DEFAULT '{}' NOT NULL,
	"mentions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ctas" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"text" text NOT NULL,
	"bg" text DEFAULT '#2D4A5C' NOT NULL,
	"fg" text DEFAULT '#FFFFFF' NOT NULL,
	"style" text DEFAULT 'solid' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"client_ids" text[] DEFAULT '{}' NOT NULL,
	"brand_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"service_id" text,
	"name" text NOT NULL,
	"short" text DEFAULT '' NOT NULL,
	"segment" text DEFAULT 'All segments' NOT NULL,
	"goals" text[] DEFAULT '{}' NOT NULL,
	"offer_type" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Ideation' NOT NULL,
	"owner_id" text,
	"positioning" text DEFAULT '' NOT NULL,
	"promise" text DEFAULT '' NOT NULL,
	"proof" text DEFAULT '' NOT NULL,
	"primary_cta_id" text,
	"secondary_cta_id" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"review" text DEFAULT 'None' NOT NULL,
	"reviewer_id" text,
	"change_note" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reads" (
	"user_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recents" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"item_id" text NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"name" text NOT NULL,
	"short" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"email" text,
	"password_hash" text,
	"role" text DEFAULT 'Team member' NOT NULL,
	"access" text DEFAULT 'Viewer' NOT NULL,
	"all_clients" boolean DEFAULT false NOT NULL,
	"client_ids" text[] DEFAULT '{}' NOT NULL,
	"brand_ids" text[] DEFAULT '{}' NOT NULL,
	"group_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "asset_versions_asset_idx" ON "asset_versions" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assets_brand_idx" ON "assets" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "brands_client_idx" ON "brands" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "comments_item_idx" ON "comments" USING btree ("kind","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "links_pair_idx" ON "links" USING btree ("asset_id","offer_id");--> statement-breakpoint
CREATE INDEX "offers_brand_idx" ON "offers" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "offers_service_idx" ON "offers" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reads_pk" ON "reads" USING btree ("user_id","comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recents_pk" ON "recents" USING btree ("user_id","kind","item_id");--> statement-breakpoint
CREATE INDEX "services_brand_idx" ON "services" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");