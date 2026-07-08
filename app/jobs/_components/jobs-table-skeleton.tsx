// app/jobs/_components/jobs-table-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";

// Shown via Suspense while the real jobs are being fetched from the database
export const JobsTableSkeleton = () => {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-gray-800/50 shadow-sm overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Render a handful of skeleton rows to mimic the table shape while loading */}
        {[...Array(6)].map((_, index) => (
          <Skeleton key={index} className="h-10 w-full bg-gray-100 dark:bg-gray-700/60" />
        ))}
      </div>
    </div>
  );
};
