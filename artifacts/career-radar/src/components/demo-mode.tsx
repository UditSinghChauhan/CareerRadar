import { useEffect } from "react";
import { useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import {
  isDemoReadOnly,
  showDemoReadOnlyToast,
  SIGN_UP_FROM_DEMO,
  useDemoStatus,
} from "@/lib/demo";

/** Leaves the demo for the sign-up page (Clerk shows it only signed out). */
function useLeaveDemoForSignUp() {
  const { signOut } = useClerk();
  return () => void signOut({ redirectUrl: SIGN_UP_FROM_DEMO });
}

/**
 * Explains, once, any write the server refused because the session is the
 * read-only demo. Components already roll back their optimistic changes and
 * skip their own error toast for this case (`isDemoReadOnly`).
 */
export function DemoWriteNotice() {
  const queryClient = useQueryClient();
  const leave = useLeaveDemoForSignUp();
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (
          event.type === "updated" &&
          event.mutation.state.status === "error" &&
          isDemoReadOnly(event.mutation.state.error)
        ) {
          showDemoReadOnlyToast(leave);
        }
      }),
    [queryClient, leave],
  );
  return null;
}

/** A quiet line above the app while the demo account is signed in. */
export function DemoBanner() {
  const { active } = useDemoStatus();
  const leave = useLeaveDemoForSignUp();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (!active) return null;
  return (
    <div
      role="region"
      aria-label="Demo account"
      className="flex min-h-10 flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-border bg-secondary px-4 py-2 text-center text-[13px] text-muted-foreground"
    >
      <span>
        <span className="font-medium text-foreground">Demo account.</span>{" "}
        Nothing you do is saved.
      </span>
      <span className="flex items-center gap-4">
        <button
          type="button"
          onClick={leave}
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create your own
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => void signOut({ redirectUrl: basePath || "/" })}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Exit demo
        </button>
      </span>
    </div>
  );
}

/** "Explore the demo", for pages outside the app (sign-in). */
export function DemoLink({ className }: { className?: string }) {
  return (
    <Link href="/demo" className={className}>
      Just looking? Explore the demo
    </Link>
  );
}
