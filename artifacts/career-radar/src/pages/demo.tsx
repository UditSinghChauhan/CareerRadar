import { useEffect, useRef, useState } from "react";
import { useAuth, useClerk } from "@clerk/react";
import { Link, Redirect, useLocation } from "wouter";
import { createDemoSession } from "@workspace/api-client-react";
import { LogoMark } from "@/components/logo-mark";
import { Button } from "@/components/ui/button";

type State = "opening" | "unavailable";

/**
 * /demo: opens the invented demo account, read-only, with no sign-up.
 * The server issues a one-time Clerk ticket (api-server/src/demo/demo.ts);
 * the browser redeems it, so the visitor holds an ordinary Clerk session
 * whose writes the server refuses.
 */
export function DemoPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<State>("opening");
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || isSignedIn || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { ticket } = await createDemoSession();
        const signIn = await clerk.client?.signIn.create({
          strategy: "ticket",
          ticket,
        });
        if (signIn?.status !== "complete" || !signIn.createdSessionId) {
          throw new Error(`Demo sign-in ended as ${signIn?.status}`);
        }
        await clerk.setActive({ session: signIn.createdSessionId });
        setLocation("/dashboard", { replace: true });
      } catch (err) {
        console.error("[CareerRadar] could not open the demo", err);
        setState("unavailable");
      }
    })();
  }, [isLoaded, isSignedIn, clerk, setLocation]);

  // Someone already signed in, the demo included, goes straight in.
  if (isLoaded && isSignedIn && !started.current) {
    return <Redirect to="/dashboard" replace />;
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-5">
      <div
        className="flex w-full max-w-sm flex-col items-center text-center"
        aria-live="polite"
      >
        <LogoMark
          className={`h-10 w-10 text-foreground ${
            state === "opening"
              ? "motion-safe:animate-[pulse_1.6s_ease-in-out_infinite]"
              : ""
          }`}
        />
        {state === "opening" ? (
          <>
            <h1 className="mt-6 text-[22px] font-medium tracking-[-0.02em]">
              Opening the demo
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              An invented student account with real postings. You can look at
              everything; nothing you do is saved.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-[22px] font-medium tracking-[-0.02em]">
              The demo isn’t available right now
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Creating an account takes a minute and shows you your own ten.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <Button asChild className="h-11 rounded-full px-6">
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button asChild variant="ghost" className="h-11 rounded-full">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
