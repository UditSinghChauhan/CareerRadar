/**
 * The signed-in app's code, split from the landing (App.tsx). Each loader
 * is the one place its chunk is imported, so App.tsx's lazy() and the
 * prefetch below share one download.
 */
export const loadLayout = () => import("@/components/layout");
export const loadDashboard = () => import("@/pages/dashboard");
export const loadWelcome = () => import("@/pages/welcome");

/**
 * Starts downloading the screens a new account sees next, while it signs
 * up or answers the onboarding question, so "Show my ten" opens the
 * dashboard without waiting for its code. Fire and forget.
 */
export function prefetchFirstRun() {
  for (const load of [loadWelcome, loadLayout, loadDashboard]) {
    void load().catch(() => undefined);
  }
}
