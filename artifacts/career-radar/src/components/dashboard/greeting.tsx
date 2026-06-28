import { useUser } from "@clerk/react";
import { format } from "date-fns";
import { Link } from "wouter";
import { Briefcase, ArrowRight } from "lucide-react";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function Greeting() {
  const { user } = useUser();
  const firstName = user?.firstName || user?.fullName?.split(" ")[0] || "there";
  const today = format(new Date(), "EEEE, d MMMM yyyy");

  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-0.5 text-sm">{today}</p>
      </div>
      <Link href="/jobs">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors cursor-pointer">
          <Briefcase className="h-4 w-4" />
          Browse jobs
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>
    </div>
  );
}
