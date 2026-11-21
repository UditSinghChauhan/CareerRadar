import {
  useGetDashboardSummary,
  useGetProfile,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Redirect } from "wouter";
import { useDemoStatus } from "@/lib/demo";

import { Greeting } from "@/components/dashboard/greeting";
import { TodaysQueue } from "@/components/dashboard/todays-queue";
import { StatCards } from "@/components/dashboard/stat-cards";
import { RecommendedJobs } from "@/components/dashboard/recommended-jobs";
import { ClosingSoon } from "@/components/dashboard/closing-soon";
import { DreamCompanies } from "@/components/dashboard/dream-companies";
import { DeadlineTimeline } from "@/components/dashboard/deadline-timeline";
import { RecentApplications } from "@/components/dashboard/recent-applications";
import { ApplicationChart } from "@/components/dashboard/application-chart";

export function DashboardPage() {
  const {
    data: summary,
    isLoading: summaryLoading,
    isError,
    refetch,
  } = useGetDashboardSummary();
  const { data: profile } = useGetProfile();
  const demo = useDemoStatus();

  // An account that has not answered the onboarding question yet: an older
  // account, or one that left /welcome. The answer is one click away. Never
  // the read-only demo: it cannot save an answer, so /welcome would be a
  // dead end (the server fills its answer in; api-server demo-seed.ts).
  if (profile && profile.rolePreference == null && demo.known && !demo.active) {
    return <Redirect to="/welcome" replace />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Failed to load dashboard</h2>
          <p className="text-muted-foreground max-w-md">
            There was a problem connecting to the server.
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Greeting ─────────────────────────────────────────────── */}
      <Greeting />

      {/* ── Today's Queue ─────────────────────────────────────────────
          Phase 3.3 puts this first, above the stat cards and the charts: the
          dashboard's job is to assign work, and everything below it reports
          history. ──────────────────────────────────────────────────── */}
      <TodaysQueue />

      {/* ── Stats ─────────────────────────────────────────────────────
          One row of five. "New opportunities" used to sit beside it with
          the same number as "Jobs found", in a taller card. ─────────── */}
      <StatCards summary={summary} isLoading={summaryLoading} />

      {/* ── Recommended + Closing Soon ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecommendedJobs />
        </div>
        <div className="lg:col-span-1">
          <ClosingSoon />
        </div>
      </div>

      {/* ── Dream Companies ───────────────────────────────────────── */}
      <DreamCompanies />

      {/* ── App Funnel + Deadline Timeline ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <ApplicationChart summary={summary} isLoading={summaryLoading} />
        </div>
        <div className="lg:col-span-2">
          <DeadlineTimeline />
        </div>
      </div>

      {/* ── Recent Applications ───────────────────────────────────── */}
      <RecentApplications />
    </div>
  );
}
