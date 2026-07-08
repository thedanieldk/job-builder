// app/jobs/page.tsx
import { getJobs } from "@/actions/jobs-actions"; // Import server action
import { Header } from "@/components/header"; // Shared header
import { Suspense } from "react"; // Import Suspense
import { JobsTable } from "./_components/jobs-table"; // Table component to display jobs
import { JobsTableSkeleton } from "./_components/jobs-table-skeleton"; // Loading state

// Opt out of caching
export const dynamic = "force-dynamic";

// Keep as default export, but we won't fetch directly here for Suspense
export default async function JobsPage() {
  return (
    <>
      <Header /> {/* Render the consistent header */}
      {/* Main content container */}
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 pt-24 pb-16">
        {/* Add sufficient top padding (pt-24) below the fixed header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page title */}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
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
  );
}

/**
 * An async Server Component responsible for fetching the data.
 * React Suspense will catch the promise awaited here and show the fallback.
 */
async function JobsLoader() {
  // Fetch the jobs data using the Server Action
  const jobs = await getJobs();

  // Once data is ready, render the Client Component with the data
  return <JobsTable initialJobs={jobs} />;
}
