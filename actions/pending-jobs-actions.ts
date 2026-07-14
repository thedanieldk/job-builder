// Ensure this directive is at the very top of the file
"use server"

import { db } from "@/db" // Drizzle db instance
import { pendingJobs } from "@/db/schema/pending-jobs-schema" // Staging table schema
import { jobs, JobCategory } from "@/db/schema/jobs-schema" // Master table schema
import { devDelay } from "@/lib/dev-delay" // Development delay helper
import { desc, eq } from "drizzle-orm" // Drizzle operators

// Shape of the fields the poller sources (JSearch, Apify LinkedIn) provide
// for a freshly-scraped listing. Mirrors the "pending_jobs" table.
export type PendingJobInput = {
  title?: string | null
  company: string
  industry?: string | null
  salary?: string | null
  location?: string | null
  category?: JobCategory
  website?: string | null
  jobLink?: string | null
  source: string
  externalId: string
}

/**
 * READ: Fetches all pending (not-yet-reviewed) jobs, newest first.
 * Powers the badge count and the list inside the "Pending Review" modal.
 */
export async function getPendingJobs() {
  try {
    await devDelay()
    console.log("Server Action: Fetching pending jobs...")
    const allPending = await db
      .select()
      .from(pendingJobs)
      .orderBy(desc(pendingJobs.createdAt))
    console.log(`Server Action: Fetched ${allPending.length} pending jobs.`)
    return allPending
  } catch (error) {
    console.error("Server Action Error (getPendingJobs):", error)
    throw new Error("Failed to fetch pending jobs.")
  }
}

/**
 * UPSERT: Called by the poller (JSearch / Apify LinkedIn) for every listing
 * it finds. Inserts a new pending row, or - if this (source, externalId)
 * was already staged - just refreshes its details in place, so re-running
 * the poll never creates duplicate pending rows for the same listing.
 */
export async function upsertPendingJob(input: PendingJobInput) {
  try {
    await devDelay()
    console.log(
      `Server Action: Upserting pending job ${input.source}/${input.externalId}...`
    )
    const [pendingJob] = await db
      .insert(pendingJobs)
      .values(input)
      .onConflictDoUpdate({
        // must match the "pending_jobs_source_external_id_idx" unique index
        target: [pendingJobs.source, pendingJobs.externalId],
        set: {
          title: input.title,
          company: input.company,
          industry: input.industry,
          salary: input.salary,
          location: input.location,
          website: input.website,
          jobLink: input.jobLink,
          category: input.category,
        },
      })
      .returning()
    console.log("Server Action: Pending job upserted:", pendingJob)
    return pendingJob
  } catch (error) {
    console.error("Server Action Error (upsertPendingJob):", error)
    throw new Error("Failed to upsert pending job.")
  }
}

/**
 * APPROVE: Promotes a pending job into the master "jobs" table, then removes
 * it from the staging table. Both steps happen in one transaction, so a
 * failure partway through can't leave the job duplicated in both tables (or
 * dropped from both).
 */
export async function approvePendingJob(id: number) {
  try {
    await devDelay()
    console.log(`Server Action: Approving pending job ${id}...`)

    const newJob = await db.transaction(async (tx) => {
      const [pendingJob] = await tx
        .select()
        .from(pendingJobs)
        .where(eq(pendingJobs.id, id))

      if (!pendingJob) {
        throw new Error("Pending job not found.")
      }

      // onConflictDoUpdate covers the case where this same external listing
      // was already approved once before, then later re-scraped (staged
      // again) and approved a second time - without this, the second
      // approval would hit the jobs table's (source, externalId) unique
      // index and throw, instead of just refreshing the existing row.
      // Your own tracking fields (applied, status, notes, contact) are left
      // untouched, same as the old poller upsert used to do.
      const [job] = await tx
        .insert(jobs)
        .values({
          title: pendingJob.title,
          company: pendingJob.company,
          industry: pendingJob.industry,
          salary: pendingJob.salary,
          location: pendingJob.location,
          category: pendingJob.category,
          website: pendingJob.website,
          jobLink: pendingJob.jobLink,
          source: pendingJob.source,
          externalId: pendingJob.externalId,
        })
        .onConflictDoUpdate({
          target: [jobs.source, jobs.externalId],
          set: {
            title: pendingJob.title,
            company: pendingJob.company,
            industry: pendingJob.industry,
            salary: pendingJob.salary,
            location: pendingJob.location,
            category: pendingJob.category,
            website: pendingJob.website,
            jobLink: pendingJob.jobLink,
            updatedAt: new Date(),
          },
        })
        .returning()

      await tx.delete(pendingJobs).where(eq(pendingJobs.id, id))

      return job
    })

    console.log("Server Action: Pending job approved into jobs:", newJob)
    return newJob
  } catch (error) {
    console.error("Server Action Error (approvePendingJob):", error)
    if (
      error instanceof Error &&
      error.message.includes("Pending job not found")
    ) {
      throw error
    }
    throw new Error("Failed to approve pending job.")
  }
}

/**
 * DISMISS: Removes a pending job you don't want, without ever creating a
 * row in the master "jobs" table. Since it only lives in the staging table,
 * a plain delete is safe here - no risk of it clobbering tracked progress
 * the way deleting straight from "jobs" would.
 */
export async function dismissPendingJob(id: number) {
  try {
    await devDelay()
    console.log(`Server Action: Dismissing pending job ${id}...`)
    const [dismissed] = await db
      .delete(pendingJobs)
      .where(eq(pendingJobs.id, id))
      .returning()

    if (!dismissed) {
      // Already gone (e.g. dismissed from another tab) - the end goal is
      // already true, so treat this as a success rather than an error.
      console.log(`Server Action: Pending job ${id} was already gone.`)
      return null
    }
    console.log("Server Action: Pending job dismissed:", dismissed)
    return dismissed
  } catch (error) {
    console.error("Server Action Error (dismissPendingJob):", error)
    throw new Error("Failed to dismiss pending job.")
  }
}
