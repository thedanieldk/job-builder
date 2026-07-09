// app/api/cron/poll-jobs/route.ts
// Cron endpoint: pulls Product Manager listings from JSearch and upserts
// them into the jobs table. Triggered daily by the "crons" entry in
// vercel.json. GTM Engineering isn't polled automatically anymore - that's
// a manual "Sync now" action (see actions/poll-actions.ts) so it can be
// triggered on demand instead of burning quota on a fixed schedule.

import { getQueriesForCategories, runJobPoll } from "@/lib/jsearch-api";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Vercel automatically sends "Authorization: Bearer $CRON_SECRET" when a
  // CRON_SECRET env var is configured on the project - this stops random
  // requests to the public URL from triggering the poll.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1 query/day = ~30 requests/month automated, leaving plenty of headroom
  // in the free-tier 200/month quota for manual GTM/PM syncs on top of this.
  const results = await runJobPoll(getQueriesForCategories(["Product Manager"]));

  return NextResponse.json({ results });
}
