/**
 * A stand-in for @clerk/react, used ONLY by capture/vite.config.ts when
 * scripts/capture-landing.mjs photographs the app for the landing page. It
 * signs in an invented demo user (no photo; the app shows no avatar) so the
 * real pages render against the local capture API without Clerk keys.
 * Never imported by the app's own build.
 */
import type { ReactNode } from "react";

const user = {
  id: "user_capture_demo",
  firstName: "Demo",
  fullName: "Demo Student",
  primaryEmailAddress: { emailAddress: "demo@example.test" },
  imageUrl: "",
};

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function Show({
  when,
  children,
}: {
  when: "signed-in" | "signed-out";
  children: ReactNode;
}) {
  return when === "signed-in" ? <>{children}</> : null;
}
export const SignIn = () => null;
export const SignUp = () => null;
export const useAuth = () => ({ isLoaded: true, isSignedIn: true });
export const useUser = () => ({ isLoaded: true, isSignedIn: true, user });
export const useClerk = () => ({
  signOut: async () => {},
  addListener: () => () => {},
});
