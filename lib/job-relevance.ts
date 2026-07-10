// lib/job-relevance.ts
// JSearch and LinkedIn's search don't do exact-phrase matching - a query for
// "GTM Engineer" can still return listings that only share the word
// "Engineer" (e.g. "Sr. Nodejs/TypeScript Engineer"), and a "New York" or
// "Remote" search can still return on-site jobs from anywhere in the country
// (e.g. "Commerce Township, MI"). This checks a job's title and location
// against what we actually searched for, so the poller can drop those false
// positives before they ever get saved.

import type { JobCategory } from "@/db/schema/jobs-schema";

// For a job to count as a real match for a category, its title has to
// contain at least one of these phrases (checked case-insensitively).
// "Other" isn't in here on purpose - it's the manual catch-all bucket with
// no search query behind it, so there's nothing to check its titles against.
const RELEVANT_TITLE_KEYWORDS: Record<Exclude<JobCategory, "Other">, string[]> = {
  "Product Manager": ["product manager", "product owner"],
  "GTM Engineering": [
    "gtm",
    "go-to-market",
    "go to market",
    "growth engineer",
    "revenue operations engineer",
    "revops engineer",
  ],
};

/**
 * Returns true if `title` actually looks like it belongs to `category`,
 * based on the keyword list above. Jobs with a missing title are let
 * through rather than dropped, since there's nothing to check - it's safer
 * to keep a possibly-relevant row than to silently lose it.
 */
export function isRelevantTitle(
  title: string | null | undefined,
  category: JobCategory,
): boolean {
  if (category === "Other") return true;
  if (!title) return true;

  const lowerTitle = title.toLowerCase();
  return RELEVANT_TITLE_KEYWORDS[category].some((keyword) => lowerTitle.includes(keyword));
}

// Every search this app runs is scoped to "New York" or "Remote" (see
// QUERY_SETS in jsearch-api.ts and SEARCH_URL_SETS in apify-linkedin.ts), so
// a job only counts as relevant if its location says one of those two things.
const NEW_YORK_PATTERN = /\bnew york\b|\bnyc\b|\bny\b/;

/**
 * Returns true if `location` is New York or remote.
 *
 * `isRemote` is JSearch's own remote flag - it's reliable, so when it's true
 * we trust it outright instead of parsing `location` text.
 *
 * LinkedIn (via Apify) has no equivalent flag - confirmed by testing that
 * its "Remote" search filter (f_WT=2) doesn't reliably apply through the
 * scraper, since it still returns plain on-site listings like "Commerce
 * Township, MI" or "Chattanooga, TN". So for that source we fall back to
 * checking the location text itself: a bare "Remote", or a bare
 * "United States" with no city (LinkedIn's way of showing "no fixed
 * location," which in practice means a nationwide/remote posting).
 *
 * A missing location is let through rather than dropped, since there's
 * nothing to check - it's safer to keep a possibly-relevant row than to
 * silently lose it.
 */
export function isRelevantLocation(
  location: string | null | undefined,
  isRemote?: boolean,
): boolean {
  if (isRemote) return true;
  if (!location) return true;

  const lowerLocation = location.toLowerCase().trim();
  if (lowerLocation === "remote" || lowerLocation === "united states") return true;
  return NEW_YORK_PATTERN.test(lowerLocation);
}
