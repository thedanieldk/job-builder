CREATE TYPE "public"."job_status" AS ENUM('Not Applied', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Ghosted');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"industry" text,
	"salary" text,
	"location" text,
	"contact" text,
	"applied" boolean DEFAULT false NOT NULL,
	"status" "job_status" DEFAULT 'Not Applied' NOT NULL,
	"website" text,
	"notes" text,
	"job_link" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
