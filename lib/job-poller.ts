// lib/job-poller.ts
// Shared orchestrator: runs the given sources (JSearch, Apify LinkedIn) for
// the given categories. Both the cron route and the manual "Sync now" action
// need "poll these categories across sources," so that logic lives here once
// instead of being duplicated in both call sites.
//
// The daily cron has JSearch disabled (see app/api/cron/poll-jobs/route.ts) -
// it only passes `sources: ["apify"]`. The manual "Sync now" buttons don't
// pass `sources`, so they still default to both and can be used to pull from
// JSearch on demand.

import {
  getQueriesForCategories,
  runJobPoll,
  type PollableCategory,
  type QueryResult,
} from "@/lib/jsearch-api";
import { getSearchUrlsForCategories, runApifyLinkedInPoll } from "@/lib/apify-linkedin";

export type PollSource = "jsearch" | "apify";

export async function pollAllSources(
  categories: PollableCategory[],
  options?: { sources?: PollSource[] }
): Promise<QueryResult[]> {
  const sources = options?.sources ?? ["jsearch", "apify"];

  const results: QueryResult[] = [];
  if (sources.includes("jsearch")) {
    results.push(...(await runJobPoll(getQueriesForCategories(categories))));
  }
  if (sources.includes("apify")) {
    results.push(...(await runApifyLinkedInPoll(getSearchUrlsForCategories(categories))));
  }
  return results;
}
