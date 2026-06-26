import { useGetDashboardSummary, useGetProfile } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, RefreshCw, UserCircle } from "lucide-react";
import { Link } from "wouter";

import { Greeting } from "@/components/dashboard/greeting";
import { StatCards } from "@/components/dashboard/stat-cards";
import { NewOpportunities } from "@/components/dashboard/new-opportunities";
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

  const showProfilePrompt =
    profile &&
    summary &&
    summary.profileCompleteness !== undefined &&
    summary.profileCompleteness < 80;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Greeting ─────────────────────────────────────────────── */}
      <Greeting />

      {/* ── Profile completion prompt ─────────────────────────────── */}
      {showProfilePrompt && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <UserCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">
                  Profile {summary.profileCompleteness}% complete
                </p>
                <p className="text-xs text-muted-foreground">
                  Complete your profile to improve job recommendations.
                </p>
              </div>
            </div>
            <Link href="/profile">
              <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 shrink-0">
                Complete Profile
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* ── New Opportunities + Stats ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 xl:grid-cols-5 gap-3">
        <div className="sm:col-span-1">
          <NewOpportunities />
        </div>
        <div className="sm:col-span-3 xl:col-span-4">
          <StatCards summary={summary} isLoading={summaryLoading} />
        </div>
      </div>

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
