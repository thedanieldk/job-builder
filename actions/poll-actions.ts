// Ensure this directive is at the very top of the file
"use server";

import { getQueriesForCategories, runJobPoll, type PollableCategory } from "@/lib/jsearch-api";

/**
 * MANUAL SYNC: Runs the JSearch poll for the given categories right now,
 * instead of waiting for the daily cron (which only covers Product Manager).
 * Called from the "Sync Product Manager" / "Sync GTM Engineering" buttons
 * on the jobs page.
 */
export async function pollJobsNow(categories: PollableCategory[]) {
  return runJobPoll(getQueriesForCategories(categories));
}
