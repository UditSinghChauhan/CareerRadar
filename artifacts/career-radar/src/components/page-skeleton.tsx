import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown inside the app shell while a page's code loads, in the shape every
 * page starts with (the header, then a card), so the shell never blanks and
 * nothing jumps when the page arrives.
 */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="space-y-2.5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-3 rounded-[14px] border border-border bg-card p-5">
        <Skeleton className="h-5 w-40" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}
