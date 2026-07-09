import {
  boolean,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// the fixed set of options for the "status" column (like an Airtable single-select field)
// keeping this as an enum (instead of free text) means every row's status is
// guaranteed to be one of these values, which makes filtering/grouping reliable
export const jobStatusEnum = pgEnum("job_status", [
  "Not Applied",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Ghosted",
]);

// TS union type derived from the enum's values, so other files can reuse it
// instead of retyping the list of statuses by hand (e.g. "Not Applied" | "Applied" | ...)
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];

// which role type this listing is - lets the UI split jobs into tabs.
// "Other" is the default for manually-added jobs you haven't categorized
export const jobCategoryEnum = pgEnum("job_category", [
  "Product Manager",
  "GTM Engineering",
  "Other",
]);

export type JobCategory = (typeof jobCategoryEnum.enumValues)[number];

// defines the "jobs" table - each row is one job listing you're tracking
export const jobs = pgTable(
  "jobs",
  {
    // auto-incrementing unique id for each job, used as the primary key
    id: serial("id").primaryKey(),
    // the job title/role (e.g. "Senior Product Manager")
    // nullable since older manually-added rows won't have this filled in
    title: text("title"),
    // name of the company posting the job
    company: text("company").notNull(),
    // industry the company operates in (e.g. "Fintech", "Healthcare")
    industry: text("industry"),
    // salary or salary range as text (e.g. "$100k - $120k") to stay flexible
    // since scraped listings won't always give a clean number
    salary: text("salary"),
    // where the job is located (e.g. "Remote", "New York, NY")
    location: text("location"),
    // a contact person/recruiter for this job, if known
    contact: text("contact"),
    // whether you've applied to this job yet (checkbox-style column)
    applied: boolean("applied").notNull().default(false),
    // where this job currently stands in your application process
    status: jobStatusEnum("status").notNull().default("Not Applied"),
    // "Product Manager" / "GTM Engineering" / "Other" - powers the tabs on the jobs page
    category: jobCategoryEnum("category").notNull().default("Other"),
    // the company's website
    website: text("website"),
    // any personal notes about this job
    notes: text("notes"),
    // direct link to the job posting
    jobLink: text("job_link"),
    // which job board/API this listing came from (e.g. "jsearch", "greenhouse")
    // lets us support multiple sources later without id collisions between them
    source: text("source"),
    // the unique id the source assigns to this listing (e.g. JSearch's job_id)
    // paired with "source" below, this is how the poller knows a job was
    // already imported so it doesn't insert the same listing twice
    externalId: text("external_id"),
    // when this job was added to the table
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // when this job was last updated, refreshed automatically on update
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // enforces "one row per (source, externalId) pair" at the database level,
    // so an upsert can safely target this combo to avoid duplicate imports
    uniqueIndex("jobs_source_external_id_idx").on(table.source, table.externalId),
  ],
);
