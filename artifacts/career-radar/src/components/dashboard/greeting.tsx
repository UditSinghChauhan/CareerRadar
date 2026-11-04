import { useUser } from "@clerk/react";
import { format } from "date-fns";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";

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
    <PageHeader
      title={`${getGreeting()}, ${firstName}`}
      description={today}
      actions={
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Browse all jobs
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    />
  );
}
