// lib/apify-linkedin.ts
// Client for the Apify "linkedin-jobs-scraper" actor - scrapes LinkedIn's
// public jobs search directly, as a second source alongside JSearch.

import { upsertJob, type JobInput } from "@/actions/jobs-actions";
import type { JobCategory } from "@/db/schema/jobs-schema";
import type { PollableCategory, QueryResult } from "@/lib/jsearch-api";

// The public "linkedin-jobs-scraper" actor by curious_coder:
// https://console.apify.com/actors/hKByXkMQaC5Qt9UMN/input
const LINKEDIN_JOBS_SCRAPER_ACTOR_ID = "hKByXkMQaC5Qt9UMN";
const APIFY_RUN_URL = `https://api.apify.com/v2/acts/${LINKEDIN_JOBS_SCRAPER_ACTOR_ID}/run-sync-get-dataset-items`;

// The actor returns more fields than this (company details, benefits, etc.);
// this is just the subset we actually use.
export interface ApifyLinkedInJob {
  id: string;
  title: string;
  companyName: string;
  companyLinkedinUrl: string | null;
  location: string | null;
  link: string;
  salary: string | null;
  industries: string | null;
}

/**
 * Runs the LinkedIn jobs scraper for one search URL and returns the raw
 * list of listings it found.
 *
 * Returns an empty array (instead of throwing) on a network error, timeout,
 * or non-2xx response, so one bad search doesn't abort a poll run that's
 * looping over several.
 */
export async function scrapeLinkedInJobs(url: string, count = 10): Promise<ApifyLinkedInJob[]> {
  const apiKey = process.env.APIFY_KEY;
  if (!apiKey) {
    throw new Error("APIFY_KEY is not set");
  }

  try {
    const response = await fetch(`${APIFY_RUN_URL}?token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: [url],
        // skip the extra per-job company-detail scrape - slower and we don't
        // use those fields, so it'd just add cost/time for no benefit here
        scrapeCompany: false,
        count,
      }),
      // scraping is slower than a plain API call (confirmed ~11s for a small
      // batch in testing) - a generous timeout so a stuck run doesn't stall
      // (or blow the timeout on) the whole poll run
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      console.error(`Apify LinkedIn search "${url}" failed with status ${response.status}`);
      return [];
    }

    return response.json();
  } catch (error) {
    console.error(`Apify LinkedIn search "${url}" threw:`, error);
    return [];
  }
}

/**
 * Maps one Apify LinkedIn listing to the shape upsertJob() expects.
 * Same "source" + "externalId" dedup pattern as mapJsearchJobToInput -
 * upsertJob updates the row in place if this listing was already imported.
 */
export function mapApifyJobToInput(
  job: ApifyLinkedInJob,
  category: JobCategory,
): JobInput & { source: string; externalId: string } {
  return {
    title: job.title,
    company: job.companyName,
    salary: job.salary || null,
    location: job.location,
    // this is the company's LinkedIn page, not their real site - JSearch's
    // employer_website is the actual site, but LinkedIn's public search
    // doesn't expose that, so this is the closest thing available
    website: job.companyLinkedinUrl,
    jobLink: job.link,
    industry: job.industries || null,
    source: "apify-linkedin",
    externalId: job.id,
    category,
  };
}

// LinkedIn search URL params, confirmed by testing: "location=" scopes to a
// city/state, and "f_WT=2" is LinkedIn's own "Remote" work-type filter.
const NY_LOCATION = "location=New%20York%2C%20United%20States";
const REMOTE_LOCATION = "location=United%20States&f_WT=2";

function linkedInSearchUrl(keywords: string, locationParams: string): string {
  return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&${locationParams}`;
}

// Same search terms as JSearch's QUERY_SETS, each scoped to NY + Remote.
const SEARCH_URL_SETS: Record<PollableCategory, { url: string; category: JobCategory }[]> = {
  "Product Manager": [
    { url: linkedInSearchUrl("Product Manager", NY_LOCATION), category: "Product Manager" },
    { url: linkedInSearchUrl("Product Manager", REMOTE_LOCATION), category: "Product Manager" },
  ],
  "GTM Engineering": [
    { url: linkedInSearchUrl("GTM Engineer", NY_LOCATION), category: "GTM Engineering" },
    { url: linkedInSearchUrl("GTM Engineer", REMOTE_LOCATION), category: "GTM Engineering" },
    { url: linkedInSearchUrl("Go-to-Market Engineer", NY_LOCATION), category: "GTM Engineering" },
    { url: linkedInSearchUrl("Go-to-Market Engineer", REMOTE_LOCATION), category: "GTM Engineering" },
  ],
};

// Flattens the requested categories into the flat search list runApifyLinkedInPoll expects.
export function getSearchUrlsForCategories(
  categories: PollableCategory[],
): { url: string; category: JobCategory }[] {
  return categories.flatMap((category) => SEARCH_URL_SETS[category]);
}

/**
 * Runs a batch of LinkedIn searches and upserts every result found.
 * Mirrors runJobPoll's shape so the cron route / manual sync action can
 * combine results from both sources into one summary.
 */
export async function runApifyLinkedInPoll(
  searches: { url: string; category: JobCategory }[],
): Promise<QueryResult[]> {
  const results: QueryResult[] = [];

  for (const { url, category } of searches) {
    const jobs = await scrapeLinkedInJobs(url);
    let upserted = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        await upsertJob(mapApifyJobToInput(job, category));
        upserted++;
      } catch (error) {
        console.error(`Failed to upsert Apify LinkedIn job ${job.id}:`, error);
        failed++;
      }
    }

    results.push({ query: url, found: jobs.length, upserted, failed });
  }

  return results;
}
