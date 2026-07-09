CREATE TYPE "public"."job_category" AS ENUM('Product Manager', 'GTM Engineering', 'Other');--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "category" "job_category" DEFAULT 'Other' NOT NULL;