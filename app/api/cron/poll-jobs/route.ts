// app/api/cron/poll-jobs/route.ts
// Cron endpoint: pulls Product Manager / GTM Engineering listings from
// JSearch and upserts them into the jobs table. Triggered daily by the
// "crons" entry in vercel.json.

import { upsertJob } from "@/actions/jobs-actions";
import { mapJsearchJobToInput, searchJobs } from "@/lib/jsearch-api";
import { NextResponse } from "next/server";

// The role searches to run each time. Each query costs one JSearch request;
// at 3 queries/day that's ~90 requests/month, comfortably inside the
// free-tier 200/month quota.
const SEARCH_QUERIES = ["Product Manager", "GTM Engineer", "Go-to-Market Engineer"];

interface QueryResult {
  query: string;
  found: number;
  upserted: number;
  failed: number;
}

export async function GET(request: Request) {
  // Vercel automatically sends "Authorization: Bearer $CRON_SECRET" when a
  // CRON_SECRET env var is configured on the project - this stops random
  // requests to the public URL from triggering the poll.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: QueryResult[] = [];

  for (const query of SEARCH_QUERIES) {
    const jsearchJobs = await searchJobs(query);
    let upserted = 0;
    let failed = 0;

    for (const job of jsearchJobs) {
      try {
        await upsertJob(mapJsearchJobToInput(job));
        upserted++;
      } catch (error) {
        // One bad record shouldn't abort the whole run - log and keep going
        console.error(`Failed to upsert job ${job.job_id}:`, error);
        failed++;
      }
    }

    results.push({ query, found: jsearchJobs.length, upserted, failed });
  }

  return NextResponse.json({ results });
}
