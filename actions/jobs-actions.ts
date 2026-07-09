// Ensure this directive is at the very top of the file
"use server";

import { db } from "@/db"; // Drizzle db instance
import { jobs, JobCategory, JobStatus } from "@/db/schema/jobs-schema"; // Jobs table schema
import { devDelay } from "@/lib/dev-delay"; // Development delay helper
import { desc, eq } from "drizzle-orm"; // Drizzle operators

// Shape of the fields that can be set when creating or updating a job.
// Everything except "company" is optional/nullable to match the schema.
export type JobInput = {
  title?: string | null;
  company: string;
  industry?: string | null;
  salary?: string | null;
  location?: string | null;
  contact?: string | null;
  applied?: boolean;
  status?: JobStatus;
  category?: JobCategory;
  website?: string | null;
  notes?: string | null;
  jobLink?: string | null;
  // which job board/API this listing came from (e.g. "jsearch"), and the
  // unique id that source gave it - together these identify an imported
  // listing so the poller can update it instead of creating a duplicate
  source?: string | null;
  externalId?: string | null;
};

/**
 * READ: Fetches all jobs, ordered by creation date descending.
 */
export async function getJobs() {
  try {
    await devDelay(); // Simulate latency in development
    console.log("Server Action: Fetching jobs...");
    const allJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt));
    console.log(`Server Action: Fetched ${allJobs.length} jobs.`);
    return allJobs;
  } catch (error) {
    console.error("Server Action Error (getJobs):", error);
    throw new Error("Failed to fetch jobs."); // Rethrow a generic error
  }
}

/**
 * CREATE: Creates a new job.
 */
export async function createJob(input: JobInput) {
  try {
    await devDelay();
    console.log("Server Action: Creating job...");
    // Insert the new job and return the inserted record
    const [newJob] = await db.insert(jobs).values(input).returning();
    console.log("Server Action: Job created:", newJob);
    return newJob;
  } catch (error) {
    console.error("Server Action Error (createJob):", error);
    throw new Error("Failed to create job.");
  }
}

/**
 * UPSERT: Creates a job from an external source (e.g. JSearch), or updates
 * it if a job with the same (source, externalId) was already imported.
 *
 * The poller/cron pipeline should call this instead of createJob, since
 * re-running it on a listing you've already imported must update that row
 * rather than throw a duplicate-key error or create a second copy.
 *
 * Only the fields that come FROM the source are refreshed on conflict -
 * your own tracking fields (applied, status, notes, contact) are left
 * untouched, so re-importing a listing never wipes out your progress on it.
 */
export async function upsertJob(input: JobInput & { source: string; externalId: string }) {
  try {
    await devDelay();
    console.log(`Server Action: Upserting job ${input.source}/${input.externalId}...`);
    const [job] = await db
      .insert(jobs)
      .values(input)
      .onConflictDoUpdate({
        // must match the "jobs_source_external_id_idx" unique index
        target: [jobs.source, jobs.externalId],
        set: {
          title: input.title,
          company: input.company,
          industry: input.industry,
          salary: input.salary,
          location: input.location,
          website: input.website,
          jobLink: input.jobLink,
          category: input.category,
          updatedAt: new Date(),
        },
      })
      .returning();
    console.log("Server Action: Job upserted:", job);
    return job;
  } catch (error) {
    console.error("Server Action Error (upsertJob):", error);
    throw new Error("Failed to upsert job.");
  }
}

/**
 * UPDATE: Updates an existing job by its ID.
 */
export async function updateJob({ id, ...input }: JobInput & { id: number }) {
  try {
    await devDelay();
    console.log(`Server Action: Updating job ${id}...`);
    // Update the job matching the ID and return the updated record
    const [updatedJob] = await db
      .update(jobs)
      .set({ ...input, updatedAt: new Date() }) // Also update updated_at
      .where(eq(jobs.id, id)) // Use eq() for equality check
      .returning();

    if (!updatedJob) {
      throw new Error("Job not found for update.");
    }
    console.log("Server Action: Job updated:", updatedJob);
    return updatedJob;
  } catch (error) {
    console.error("Server Action Error (updateJob):", error);
    // Rethrow specific errors or a generic one
    if (error instanceof Error && error.message.includes("Job not found")) {
      throw error;
    }
    throw new Error("Failed to update job.");
  }
}

/**
 * DELETE: Deletes a job by its ID.
 */
export async function deleteJob(id: number) {
  try {
    await devDelay();
    console.log(`Server Action: Deleting job ${id}...`);
    // Delete the job matching the ID and return the deleted record
    const [deletedJob] = await db.delete(jobs).where(eq(jobs.id, id)).returning();

    if (!deletedJob) {
      throw new Error("Job not found for deletion.");
    }
    console.log("Server Action: Job deleted:", deletedJob);
    return deletedJob;
  } catch (error) {
    console.error("Server Action Error (deleteJob):", error);
    if (error instanceof Error && error.message.includes("Job not found")) {
      throw error;
    }
    throw new Error("Failed to delete job.");
  }
}
