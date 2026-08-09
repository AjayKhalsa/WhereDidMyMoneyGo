import { Skeleton } from "@/components/ui/primitives";

/**
 * Boot skeleton.
 *
 * Mirrors the real Home layout closely enough that nothing jumps when data
 * arrives. The hero block is the same height as the actual hero, which is the
 * difference between a considered loading state and a flash of grey boxes.
 */
export function HomeSkeleton() {
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Loading your finances">
      <div className="pt-1">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-[58px] w-64 sm:h-[68px] sm:w-80" />
        <Skeleton className="mt-3 h-5 w-44" />
        <Skeleton className="mt-3 h-4 w-full max-w-md" />
        <div className="mt-6 max-w-md space-y-2">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-1 w-full" />
        </div>
      </div>

      <Skeleton className="h-px w-full" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-6 w-24" />
          </div>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-12">
        <div className="space-y-3">
          <Skeleton className="h-3.5 w-40" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 px-2.5 py-1">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
          <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />
        </div>
      </div>
    </div>
  );
}
