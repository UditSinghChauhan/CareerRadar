import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, Briefcase, Calendar, Clock, RefreshCw, Trophy } from "lucide-react";
import { Link } from "wouter";

export function DashboardPage() {
  const { data: summary, isLoading, isError, refetch } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Failed to load dashboard</h2>
          <p className="text-muted-foreground max-w-md">There was a problem connecting to the server.</p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!summary) return null;

  const isEmpty = summary.totalApplications === 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your placements.</p>
      </div>

      {isEmpty ? (
        <Card className="border-dashed border-2 bg-secondary/50">
          <CardContent className="flex flex-col items-center justify-center h-64 text-center space-y-4 py-8">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <Trophy className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold">Your journey starts here</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              You haven't tracked any applications yet. Add your first job or internship to begin your placement journey.
            </p>
            {/* The API doesn't have an applications endpoint yet, so this button is just a placeholder */}
            <Button className="mt-4" disabled>
              <Briefcase className="h-4 w-4 mr-2" />
              Add Application (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Applications</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.totalApplications}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Applied</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.appliedCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Deadlines</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{summary.upcomingDeadlines}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary.recentActivity}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {summary.profileCompleteness !== undefined && summary.profileCompleteness < 100 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="font-semibold text-primary">Profile Completeness: {summary.profileCompleteness}%</h3>
              <p className="text-sm text-muted-foreground">Complete your profile to unlock better tracking insights.</p>
            </div>
            <Link href="/profile">
              <Button variant="default">Complete Profile</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
