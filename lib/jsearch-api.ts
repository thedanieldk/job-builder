// lib/jsearch-api.ts
// Small client for the JSearch API (RapidAPI) - used by the cron poller to
// pull in Product Manager / GTM Engineering listings automatically.

import type { JobInput } from "@/actions/jobs-actions";

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

  const response = await fetch(url, {
    headers: {
      "x-rapidapi-host": JSEARCH_HOST,
      "x-rapidapi-key": apiKey,
    },
  });

  const body = await response.json();
  if (body.status !== "OK") {
    console.error(`JSearch query "${query}" failed:`, body);
    return [];
  }

  return body.data?.jobs ?? [];
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
 */
export function mapJsearchJobToInput(
  job: JsearchJob,
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
  };
}
