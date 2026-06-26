import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Briefcase, CheckCircle2, Target, Zap } from "lucide-react";

export function LandingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary/20">
      <header className="h-16 flex items-center justify-between px-6 lg:px-12 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center space-x-2 text-primary font-bold text-xl">
          <Briefcase className="h-6 w-6" />
          <span>CareerRadar</span>
        </div>
        <div className="flex items-center space-x-4">
          <Link href={`${basePath}/sign-in`}>
            <Button variant="ghost">Sign In</Button>
          </Link>
          <Link href={`${basePath}/sign-up`}>
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center text-center px-6 lg:px-12 pt-24 lg:pt-32 pb-16">
        <div className="max-w-3xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
            The personal placement OS for CS students
          </div>
          <h1 className="text-5xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1]">
            Track your path to <span className="text-primary">placement.</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Stop losing track of internship deadlines and interview rounds in messy spreadsheets. 
            CareerRadar is your quiet, focused command center designed to get you hired.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <Link href={`${basePath}/sign-up`}>
              <Button size="lg" className="h-12 px-8 text-base font-medium rounded-full shadow-lg shadow-primary/25">
                Start tracking now <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href={`${basePath}/sign-in`}>
              <Button variant="outline" size="lg" className="h-12 px-8 text-base font-medium rounded-full">
                Sign in to dashboard
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-8 max-w-5xl mt-32 w-full animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-200 fill-mode-both">
          <div className="flex flex-col items-center p-6 bg-card rounded-2xl border border-border shadow-sm">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Target className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Centralized Tracking</h3>
            <p className="text-muted-foreground text-center">One place for all your applications, from first round to final offer.</p>
          </div>
          <div className="flex flex-col items-center p-6 bg-card rounded-2xl border border-border shadow-sm">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Deadline Alerts</h3>
            <p className="text-muted-foreground text-center">Never miss an OA or interview scheduling deadline again.</p>
          </div>
          <div className="flex flex-col items-center p-6 bg-card rounded-2xl border border-border shadow-sm">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Profile Readiness</h3>
            <p className="text-muted-foreground text-center">Keep your resume, CGPA, and skills up-to-date and ready to deploy.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
