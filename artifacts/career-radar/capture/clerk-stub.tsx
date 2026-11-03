/**
 * A stand-in for @clerk/react, used ONLY by capture/vite.config.ts when
 * scripts/capture-landing.mjs and scripts/record-walkthrough.mjs photograph
 * the app. It signs in an invented demo user (no photo; the app shows no
 * avatar) so the real pages render against the local capture API without
 * Clerk keys. Never imported by the app's own build.
 *
 * Signed in by default. A capture that starts on the landing sets
 * localStorage "capture-signed-in" to "0"; the stand-in sign-up card below
 * then signs the demo user in and sends them where Clerk would (/welcome).
 * The real sign-up card is Clerk's and needs Clerk keys, so the walkthrough
 * shows this local stand-in in its place, styled like the real one.
 */
import type { ReactNode } from "react";

const user = {
  id: "user_capture_demo",
  firstName: "Demo",
  fullName: "Demo Student",
  primaryEmailAddress: { emailAddress: "demo@example.test" },
  imageUrl: "",
};

function signedIn(): boolean {
  try {
    return localStorage.getItem("capture-signed-in") !== "0";
  } catch {
    return true;
  }
}

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
  return (when === "signed-in") === signedIn() ? <>{children}</> : null;
}
export const SignIn = () => null;
export function SignUp() {
  const go = () => {
    localStorage.setItem("capture-signed-in", "1");
    window.location.assign("/welcome");
  };
  return (
    <div
      data-capture-standin="sign-up"
      style={{
        width: 400,
        maxWidth: "100%",
        background: "#fff",
        border: "1px solid #e4e4df",
        borderRadius: 14,
        boxShadow:
          "0 1px 2px rgb(0 0 0 / 4%), 0 16px 40px -20px rgb(0 0 0 / 14%)",
        padding: "40px 32px",
        textAlign: "center",
        fontFamily: "Geist, sans-serif",
        color: "#111",
      }}
    >
      <img
        src="/logo.svg"
        alt=""
        style={{ height: 40, margin: "0 auto 20px" }}
      />
      <h1 style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.015em" }}>
        Join CareerRadar
      </h1>
      <p style={{ color: "#6b6b66", fontSize: 14, margin: "6px 0 24px" }}>
        Ten roles worth applying to, every morning.
      </p>
      <button
        type="button"
        onClick={go}
        style={{
          width: "100%",
          height: 44,
          borderRadius: 999,
          background: "#111",
          color: "#fff",
          fontSize: 14,
          fontWeight: 500,
          border: 0,
          cursor: "pointer",
        }}
      >
        Continue with Google
      </button>
    </div>
  );
}
export const useAuth = () => ({ isLoaded: true, isSignedIn: signedIn() });
export const useUser = () => ({ isLoaded: true, isSignedIn: signedIn(), user });
export const useClerk = () => ({
  signOut: async () => {},
  addListener: () => () => {},
});
