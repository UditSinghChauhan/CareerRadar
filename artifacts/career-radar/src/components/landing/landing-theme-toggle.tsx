import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * What to store when the visitor flips the theme. Picking the theme the
 * system already shows stores "system", so the page goes back to following
 * the OS instead of pinning a choice that happens to match it today.
 * (DESIGN.md, Theme behaviour.)
 */
export function nextThemeChoice(
  shown: "light" | "dark",
  systemPrefersDark: boolean,
): "light" | "dark" | "system" {
  const target = shown === "dark" ? "light" : "dark";
  const system = systemPrefersDark ? "dark" : "light";
  return target === system ? "system" : target;
}

export function LandingThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes resolves the theme on the client; render a stable label
  // until it has, so the first paint never shows the wrong icon.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shown = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const label =
    shown === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      className="lp-toggle"
      aria-label={label}
      title={label}
      onClick={() =>
        setTheme(
          nextThemeChoice(
            shown,
            window.matchMedia?.("(prefers-color-scheme: dark)").matches ??
              false,
          ),
        )
      }
    >
      {shown === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
