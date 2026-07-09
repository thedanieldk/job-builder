// lib/jsearch-api.ts
// Small client for the JSearch API (RapidAPI) - used by the cron poller to
// pull in Product Manager / GTM Engineering listings automatically.

import { upsertJob, type JobInput } from "@/actions/jobs-actions";
import type { JobCategory } from "@/db/schema/jobs-schema";

// JSearch returns 40+ fields per job; this is just the subset we actually use.
export interface JsearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_website: string | null;
  job_location: string | null;
  job_is_remote: boolean;
  job_apply_link: string | null;
  job_salary_string: string | null;
  job_min_salary: number | null;
  job_max_salary: number | null;
}

// NOTE: the generic JSearch docs advertise a "/search" endpoint, but this
// RapidAPI subscription is actually routed to "/search-v2" (confirmed by
// testing - "/search" returns a 404 "Endpoint does not exist" from RapidAPI's
// own gateway, before the request even reaches JSearch).
const JSEARCH_HOST = "jsearch.p.rapidapi.com";
const JSEARCH_URL = `https://${JSEARCH_HOST}/search-v2`;

/**
 * Searches JSearch for a given query (e.g. "Product Manager") and returns
 * the raw list of job listings it found.
 *
 * Returns an empty array (instead of throwing) when JSearch reports a
 * non-OK status, so one bad/rate-limited query doesn't abort a poll run
 * that's looping over several queries.
 */
export async function searchJobs(query: string): Promise<JsearchJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    throw new Error("RAPIDAPI_KEY is not set");
  }

  const url = new URL(JSEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("country", "us");
  // "week" gives a safety margin if a daily cron run is ever missed - re-seeing
  // a listing we already imported is harmless, since upsertJob dedupes on
  // (source, externalId) instead of creating a duplicate row.
  url.searchParams.set("date_posted", "week");

  try {
    const response = await fetch(url, {
      headers: {
        "x-rapidapi-host": JSEARCH_HOST,
        "x-rapidapi-key": apiKey,
      },
      // fail fast instead of hanging if JSearch/RapidAPI is slow or unreachable -
      // a stuck request here shouldn't stall (or blow the timeout on) the whole poll run
      signal: AbortSignal.timeout(20_000),
    });

    const body = await response.json();
    if (body.status !== "OK") {
      console.error(`JSearch query "${query}" failed:`, body);
      return [];
    }

    return body.data?.jobs ?? [];
  } catch (error) {
    // network error, timeout, or bad JSON - treat like "found nothing" so the
    // other queries in the poll run still get a chance to complete
    console.error(`JSearch query "${query}" threw:`, error);
    return [];
  }
}

// JSearch sometimes gives a ready-made salary string, sometimes just a
// min/max range (and sometimes neither) - this normalizes it to one string.
function formatSalary(job: JsearchJob): string | null {
  if (job.job_salary_string) return job.job_salary_string;
  if (job.job_min_salary && job.job_max_salary) {
    return `$${job.job_min_salary.toLocaleString()} - $${job.job_max_salary.toLocaleString()}`;
  }
  return null;
}

/**
 * Maps one JSearch job listing to the shape upsertJob() expects.
 * "source" + "externalId" together are the pair upsertJob uses to detect
 * "have we already imported this listing" and update it in place instead
 * of creating a duplicate row.
 *
 * "category" is passed in rather than guessed from the title, since the
 * caller already knows which search query found this job (e.g. the
 * "Product Manager" query vs. the "GTM Engineer" query).
 */
export function mapJsearchJobToInput(
  job: JsearchJob,
  category: JobCategory,
): JobInput & { source: string; externalId: string } {
  return {
    title: job.job_title,
    company: job.employer_name,
    salary: formatSalary(job),
    location: job.job_is_remote ? "Remote" : job.job_location,
    website: job.employer_website,
    jobLink: job.job_apply_link,
    source: "jsearch",
    externalId: job.job_id,
    category,
  };
}

// The two role categories we can actually search JSearch for. "Other" is
// excluded on purpose - it's the manual catch-all bucket for hand-added jobs,
// there's no search query that means "other."
export type PollableCategory = Exclude<JobCategory, "Other">;

// Which JSearch queries to run for each pollable category. Product Manager
// is one query; GTM Engineering needs two since neither phrase alone covers
// how the role gets listed across job boards.
const QUERY_SETS: Record<PollableCategory, { query: string; category: JobCategory }[]> = {
  "Product Manager": [{ query: "Product Manager", category: "Product Manager" }],
  "GTM Engineering": [
    { query: "GTM Engineer", category: "GTM Engineering" },
    { query: "Go-to-Market Engineer", category: "GTM Engineering" },
  ],
};

// Flattens the requested categories into the flat query list runJobPoll expects.
export function getQueriesForCategories(
  categories: PollableCategory[],
): { query: string; category: JobCategory }[] {
  return categories.flatMap((category) => QUERY_SETS[category]);
}

export interface QueryResult {
  query: string;
  found: number;
  upserted: number;
  failed: number;
}

/**
 * Runs a batch of JSearch queries and upserts every result found.
 * Used by both the daily cron (Product Manager only) and the manual
 * "Sync now" buttons (either category, on demand).
 */
export async function runJobPoll(
  queries: { query: string; category: JobCategory }[],
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];

  for (const { query, category } of queries) {
    const jsearchJobs = await searchJobs(query);
    let upserted = 0;
    let failed = 0;

    for (const job of jsearchJobs) {
      try {
        await upsertJob(mapJsearchJobToInput(job, category));
        upserted++;
      } catch (error) {
        // One bad record shouldn't abort the whole run - log and keep going
        console.error(`Failed to upsert job ${job.job_id}:`, error);
        failed++;
      }
    }

    results.push({ query, found: jsearchJobs.length, upserted, failed });
  }

  return results;
}
