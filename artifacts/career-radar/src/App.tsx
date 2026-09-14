import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import {
  Switch,
  Route,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import { LandingPage } from "@/pages/landing";
import { DashboardPage } from "@/pages/dashboard";
import { JobsPage } from "@/pages/jobs";
import { ApplicationsPage } from "@/pages/applications";
import { ProfilePage } from "@/pages/profile";
import { SettingsPage } from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

/**
 * Why a Clerk publishable key is not well-formed, or null if it is.
 *
 * The key is `pk_test_` / `pk_live_` followed by base64 of the Clerk frontend
 * API host with a trailing "$". Clerk decodes it to work out where to load
 * clerk-js from, so a corrupted key does not fail loudly — it produces an empty
 * host and a request to "https:///npm/@clerk/clerk-js@6/dist/clerk.browser.js".
 */
function describeKeyProblem(key: string): string | null {
  if (!/^pk_(test|live)_/.test(key)) {
    return 'it does not start with "pk_test_" or "pk_live_"';
  }

  const encoded = key.slice(key.indexOf("_", 3) + 1);
  if (encoded.length === 0) return "it has no payload after the prefix";

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return "the part after the prefix is not valid base64";
  }

  if (!decoded.endsWith("$")) {
    return `it decodes to "${decoded}", which is not a Clerk frontend API host (a valid one ends with "$")`;
  }

  const host = decoded.slice(0, -1);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
    return `it decodes to "${host}", which is not a valid hostname`;
  }

  return null;
}

// A console error, never a throw. This runs at module scope on every page load,
// so a wrong check here must not be able to white-screen the app — which is
// what makes it safe wherever it ends up running.
//
// ON WHETHER THIS SHIPS. `import.meta.env.DEV` is inlined at build time, so the
// block is dead-code eliminated when NODE_ENV resolves to production during the
// build. Measured 2026-09-14: it IS stripped under `NODE_ENV=production vite
// build`, and it is NOT stripped by a plain local `vite build`, because the
// monorepo-root .env sets `NODE_ENV=development` and vite.config.ts points
// envDir at that file. Do not "fix" that by setting NODE_ENV=production as a
// build-time variable on Render — CLAUDE.md forbids it, because pnpm then skips
// devDependencies and the build fails with `vite: not found`. If this block
// does ship, the cost is a few hundred bytes and a console line that only
// appears when the key is genuinely malformed, which is a useful diagnostic in
// any environment.
//
// WHAT IT CATCHES. The guard above only rejects an absent key. A malformed but
// truthy one sails past it, and the only symptom is a blank page plus a
// 30-second timeout on `window.Clerk.loaded` — with nothing in the error
// pointing at the key. That cost a long debugging session when a hand-edit to
// .env lost a newline and glued `PORT=8080` onto the end of
// VITE_CLERK_PUBLISHABLE_KEY. Ten seconds of validation here would have named
// the cause immediately.
if (import.meta.env.DEV) {
  const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  // The env var, not the derived `clerkPubKey`: the env var is the thing that
  // gets hand-edited, and `publishableKeyFromHost` legitimately derives a
  // different key on proxy/satellite hosts.
  const problem = rawKey ? describeKeyProblem(rawKey) : null;

  if (problem) {
    console.error(
      `[CareerRadar] VITE_CLERK_PUBLISHABLE_KEY looks malformed: ${problem}\n` +
        `  Value length: ${rawKey.length} characters.\n` +
        "  Clerk will fail to load and the app will render nothing.\n" +
        "  Check the root .env for a lost newline — an adjacent variable glued " +
        "onto the end of this one is the usual cause.\n" +
        "  Also check your shell: an exported VITE_CLERK_PUBLISHABLE_KEY " +
        "overrides the file for Vite, so repairing .env alone may change nothing.",
    );
  }
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(250 89% 65%)",
    colorForeground: "hsl(0 0% 9%)",
    colorMutedForeground: "hsl(0 0% 45%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 98%)",
    colorInputForeground: "hsl(0 0% 9%)",
    colorNeutral: "hsl(0 0% 90%)",
    fontFamily: "Geist, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border border-gray-200 shadow-sm",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold tracking-tight text-gray-900",
    headerSubtitle: "text-sm text-gray-500",
    socialButtonsBlockButtonText: "text-sm font-medium",
    formFieldLabel: "text-sm font-medium text-gray-900",
    footerActionLink:
      "text-sm font-medium text-[hsl(250,89%,65%)] hover:text-[hsl(250,89%,55%)]",
    footerActionText: "text-sm text-gray-500",
    dividerText: "text-xs text-gray-400 font-medium",
    identityPreviewEditButton: "text-[hsl(250,89%,65%)]",
    formFieldSuccessText: "text-green-600",
    alertText: "text-[hsl(0,84%,60%)]",
    logoBox: "flex justify-center mb-6",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton:
      "border border-gray-200 rounded-md hover:bg-gray-50",
    formButtonPrimary:
      "bg-[hsl(250,89%,65%)] hover:bg-[hsl(250,89%,55%)] text-white shadow-sm rounded-md",
    formFieldInput:
      "flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(250,89%,65%)]",
    footerAction: "mt-6 border-t border-gray-100 pt-6",
    dividerLine: "bg-gray-200",
    alert: "bg-red-50 border border-red-200 rounded-md p-3",
    otpCodeFieldInput: "border border-gray-200 rounded-md",
    formFieldRow: "mb-4",
    main: "w-full",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 selection:bg-primary/20">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 selection:bg-primary/20">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>
          <Component />
        </AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back to CareerRadar",
            subtitle: "Track your path to placement",
          },
        },
        signUp: {
          start: {
            title: "Join CareerRadar",
            subtitle: "Your personal placement OS",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/dashboard">
            <ProtectedRoute component={DashboardPage} />
          </Route>
          <Route path="/jobs">
            <ProtectedRoute component={JobsPage} />
          </Route>
          <Route path="/applications">
            <ProtectedRoute component={ApplicationsPage} />
          </Route>
          <Route path="/profile">
            <ProtectedRoute component={ProfilePage} />
          </Route>
          <Route path="/settings">
            <ProtectedRoute component={SettingsPage} />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
