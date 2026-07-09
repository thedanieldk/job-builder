// lib/job-poller.ts
// Shared orchestrator: runs every source (JSearch, Apify LinkedIn) for the
// given categories. Both the cron route and the manual "Sync now" action
// need "poll these categories across all sources," so that logic lives here
// once instead of being duplicated in both call sites.

import {
  getQueriesForCategories,
  runJobPoll,
  type PollableCategory,
  type QueryResult,
} from "@/lib/jsearch-api";
import { getSearchUrlsForCategories, runApifyLinkedInPoll } from "@/lib/apify-linkedin";

export async function pollAllSources(categories: PollableCategory[]): Promise<QueryResult[]> {
  const jsearchResults = await runJobPoll(getQueriesForCategories(categories));
  const apifyResults = await runApifyLinkedInPoll(getSearchUrlsForCategories(categories));
  return [...jsearchResults, ...apifyResults];
}
