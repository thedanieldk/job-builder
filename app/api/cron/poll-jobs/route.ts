// app/api/cron/poll-jobs/route.ts
// Cron endpoint: pulls Product Manager listings from Apify LinkedIn and
// upserts them into the pending_jobs staging table for review (see the
// "Pending Review" modal on the jobs page) - nothing lands in the master
// jobs table until you approve it there. Triggered daily by the "crons"
// entry in vercel.json. GTM Engineering isn't polled automatically - that's
// a manual "Sync now" action (see actions/poll-actions.ts) so it can be
// triggered on demand instead of running on a fixed schedule.
//
// JSearch polling is disabled here (see lib/job-poller.ts) - it's still
// available via the manual "Sync now" buttons, just not on the daily cron.

import { pollAllSources } from "@/lib/job-poller";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Vercel automatically sends "Authorization: Bearer $CRON_SECRET" when a
  // CRON_SECRET env var is configured on the project - this stops random
  // requests to the public URL from triggering the poll.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Product Manager only, Apify LinkedIn only, both locations (NY + Remote):
  // - Apify LinkedIn: 2 runs/day x ~10 results = ~20 events/day, roughly
  //   $0.02/day (~$0.60/month) at the per-event pricing seen during testing -
  //   this one is metered spend, not a free quota, so it's worth keeping an
  //   eye on usage if manual syncs get run often too.
  const results = await pollAllSources(["Product Manager"], { sources: ["apify"] });

  return NextResponse.json({ results });
}
