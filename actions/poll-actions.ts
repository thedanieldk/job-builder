// Ensure this directive is at the very top of the file
"use server";

import { pollAllSources } from "@/lib/job-poller";
import type { PollableCategory } from "@/lib/jsearch-api";

/**
 * MANUAL SYNC: Runs the poll (JSearch + Apify LinkedIn) for the given
 * categories right now, instead of waiting for the daily cron (which only
 * covers Product Manager). Called from the "Sync Product Manager" /
 * "Sync GTM Engineering" buttons on the jobs page.
 */
export async function pollJobsNow(categories: PollableCategory[]) {
  return pollAllSources(categories);
}
