import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core"

// A reusable library of cover letter paragraphs ("snippets"). Each row is one
// chunk of writing (an experience story, a project you're proud of, etc.)
// that the AI generator can pull from and blend together when drafting a
// cover letter for a specific job - instead of you writing every letter
// from scratch.
export const coverLetterSnippets = pgTable("cover_letter_snippets", {
  id: serial("id").primaryKey(),
  // short, stable identifier used by the seed script to know which row is
  // which (e.g. "oracle-enterprise") - lets you re-run the seed to update a
  // snippet's content/tags without creating a duplicate row
  slug: text("slug").notNull().unique(),
  // free-text keywords describing what this snippet is about (e.g.
  // ["enterprise", "CRM", "B2B"]). Stored as a Postgres array instead of a
  // fixed enum (like jobs.category) because a snippet can touch many themes
  // at once, and the list of possible tags will keep growing as you add
  // more snippets - an enum would mean a migration every time.
  tags: text("tags").array().notNull(),
  // the actual paragraph text
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
