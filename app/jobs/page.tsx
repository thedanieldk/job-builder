// app/jobs/page.tsx
import { getJobs } from "@/actions/jobs-actions" // Import server action
import { getPendingJobs } from "@/actions/pending-jobs-actions" // Pending-review queue
import { Header } from "@/components/header" // Shared header
import { Suspense } from "react" // Import Suspense
import { JobsTable } from "./_components/jobs-table" // Table component to display jobs
import { JobsTableSkeleton } from "./_components/jobs-table-skeleton" // Loading state

// Opt out of caching
export const dynamic = "force-dynamic"

// Keep as default export, but we won't fetch directly here for Suspense
export default async function JobsPage() {
  return (
    <>
      <Header /> {/* Render the consistent header */}
      {/* Main content container */}
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 pt-24 pb-16 dark:from-gray-900 dark:to-gray-800">
        {/* Add sufficient top padding (pt-24) below the fixed header */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Page title */}
          <h1 className="mb-8 text-3xl font-bold text-gray-900 dark:text-white">
            Job Tracker
          </h1>

          {/* Use Suspense to handle the loading state */}
          <Suspense fallback={<JobsTableSkeleton />}>
            {/* Render an intermediate async component to handle data fetching */}
            <JobsLoader />
          </Suspense>
        </div>
      </div>
    </>
  )
}

/**
 * An async Server Component responsible for fetching the data.
 * React Suspense will catch the promise awaited here and show the fallback.
 */
async function JobsLoader() {
  // Fetch both the master jobs list and the pending-review queue up front,
  // in parallel, so the Client Component gets everything it needs in one
  // shot instead of fetching pending jobs itself after mount.
  const [jobs, pendingJobs] = await Promise.all([getJobs(), getPendingJobs()])

  // Once data is ready, render the Client Component with the data
  return <JobsTable initialJobs={jobs} initialPendingJobs={pendingJobs} />
}
