CREATE TABLE "pending_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text,
	"company" text NOT NULL,
	"industry" text,
	"salary" text,
	"location" text,
	"category" "job_category" DEFAULT 'Other' NOT NULL,
	"website" text,
	"job_link" text,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pending_jobs_source_external_id_idx" ON "pending_jobs" USING btree ("source","external_id");