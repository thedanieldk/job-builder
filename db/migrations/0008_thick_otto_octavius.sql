CREATE TABLE "cover_letter_snippets" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"tags" text[] NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cover_letter_snippets_slug_unique" UNIQUE("slug")
);
