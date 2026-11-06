import { Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/page-skeleton";

/**
 * Stands in for the app shell while its code loads (App.tsx), in the
 * shell's own shape: the 256px sidebar from 768px up, the 64px header bar,
 * and the page skeleton inside. Never a blank screen.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-[100dvh] w-full bg-background text-foreground">
      <div
        aria-hidden="true"
        className="hidden md:block w-64 border-r border-border bg-card"
      >
        <div className="h-16 border-b border-border" />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div
          aria-hidden="true"
          className="h-16 border-b border-border bg-card"
        />
        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
            <PageSkeleton />
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Where the shell's code loads (App.tsx). Its fallback used to be nothing,
 * so "Show my ten" opened a blank screen until the code arrived
 * (scripts/first-minute.mjs); now it is the shell's skeleton.
 */
export function ShellBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ShellSkeleton />}>{children}</Suspense>;
}
