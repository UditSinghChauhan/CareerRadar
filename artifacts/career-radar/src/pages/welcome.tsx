import { useEffect } from "react";
import { useGetProfile } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { LogoMark } from "@/components/logo-mark";
import { prefetchFirstRun } from "@/lib/app-chunks";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PreferencesForm,
  preferencesFrom,
} from "@/components/onboarding/preferences-form";
import { useSavePreferences } from "@/components/onboarding/use-save-preferences";

/**
 * The one step between sign-up and Today's ten. Two questions with complete
 * defaults, one button, then the ranked queue. No profile form: college,
 * CGPA and the rest stay optional on the Profile page.
 */
export function WelcomePage() {
  const [, setLocation] = useLocation();
  const { data: profile, isLoading } = useGetProfile();
  const { save, pending, error } = useSavePreferences();
  // The dashboard is next: have its code ready before "Show my ten".
  useEffect(prefetchFirstRun, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-xl items-center px-5">
        <span className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <LogoMark className="h-5 w-5" />
          <span translate="no">CareerRadar</span>
        </span>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-16 pt-6 sm:pt-12 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
        <h1 className="text-[2rem] font-medium leading-[1.1] tracking-[-0.03em] text-balance">
          Two choices, then your ten.
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-muted-foreground text-pretty">
          Roles that fit come first in Today’s ten. You can change this any time
          in Settings.
        </p>
        <div className="mt-8 rounded-[14px] border border-border bg-card p-5 shadow-[var(--card-shadow)] sm:p-7">
          {isLoading ? (
            <div className="space-y-8" aria-busy="true" aria-label="Loading">
              <div className="space-y-3">
                <Skeleton className="h-4 w-44" />
                <div className="flex gap-2">
                  {[112, 128, 72].map((w) => (
                    <Skeleton
                      key={w}
                      className="h-10 rounded-full"
                      style={{ width: w }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-40" />
                <div className="flex flex-wrap gap-2">
                  {[150, 88, 104, 104, 72, 88].map((w, i) => (
                    <Skeleton
                      key={i}
                      className="h-10 rounded-full"
                      style={{ width: w }}
                    />
                  ))}
                </div>
              </div>
              <Skeleton className="h-10 w-32 rounded-full" />
            </div>
          ) : (
            <PreferencesForm
              initial={preferencesFrom(profile)}
              submitLabel="Show my ten"
              pending={pending}
              error={error}
              onSubmit={(value) => save(value, () => setLocation("/dashboard"))}
            />
          )}
        </div>
      </main>
    </div>
  );
}
