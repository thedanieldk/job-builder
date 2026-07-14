import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { jobCategoryEnum } from "./jobs-schema"

// Staging table for jobs the poller (JSearch / Apify LinkedIn) has found but
// you haven't reviewed yet. Nothing here shows up in the master "jobs" table
// until you approve it from the "Pending Review" modal - that's what keeps
// the main jobs page free of irrelevant scraped listings.
export const pendingJobs = pgTable(
  "pending_jobs",
  {
    id: serial("id").primaryKey(),
    title: text("title"),
    company: text("company").notNull(),
    industry: text("industry"),
    salary: text("salary"),
    location: text("location"),
    // "Product Manager" / "GTM Engineering" / "Other" - same enum as the jobs table
    category: jobCategoryEnum("category").notNull().default("Other"),
    website: text("website"),
    jobLink: text("job_link"),
    // which job board/API this listing came from (e.g. "jsearch", "apify-linkedin")
    source: text("source").notNull(),
    // the unique id the source assigns to this listing - paired with "source"
    // below, this is how the poller avoids inserting the same listing twice
    externalId: text("external_id").notNull(),
    // when this job was first discovered by the poller
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pending_jobs_source_external_id_idx").on(
      table.source,
      table.externalId
    ),
  ]
)
