import { Link } from "wouter";
import { LogoMark } from "@/components/logo-mark";
import { Button } from "@/components/ui/button";

/**
 * Any address the app does not know. In the brand's type and tokens, light
 * and dark, with the two ways on: home, or the demo.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <Link
        href="/"
        aria-label="CareerRadar, home"
        className="mb-10 text-foreground"
      >
        <LogoMark className="h-9 w-9" />
      </Link>
      <p className="font-mono text-[13px] text-muted-foreground">404</p>
      <h1 className="mt-3 max-w-[18ch] text-[clamp(2rem,1.5rem+2vw,2.75rem)] font-medium leading-[1.05] tracking-[-0.035em] text-balance">
        This page isn’t on the radar.
      </h1>
      <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-muted-foreground text-pretty">
        The link may be old, or the address mistyped. Today’s ten are where they
        always are.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="h-11 rounded-full px-6">
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-full px-6">
          <Link href="/demo">Explore the demo</Link>
        </Button>
      </div>
    </main>
  );
}
