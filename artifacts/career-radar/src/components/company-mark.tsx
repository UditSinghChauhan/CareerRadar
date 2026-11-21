import { useState } from "react";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const SIZES = {
  xs: "h-5 w-5 rounded text-[9px]",
  sm: "h-7 w-7 rounded-md text-[10px]",
  md: "h-8 w-8 rounded-md text-[11px]",
  lg: "h-9 w-9 rounded-lg text-xs",
} as const;

/**
 * A company's logo, or its initials when it has none or the URL fails.
 * One mark for every list in the app, so a row never shows a generic
 * building icon in one card and initials in the next, and never a
 * broken-image glyph: several stored logo URLs now 404 upstream.
 */
export function CompanyMark({
  name,
  logoUrl,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  logoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = name?.trim() || "?";
  const box = cn(
    "flex shrink-0 items-center justify-center border border-border",
    SIZES[size],
    className,
  );

  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={cn(box, "bg-white object-contain p-0.5")}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(box, "bg-secondary font-semibold text-foreground")}
    >
      {initials(label)}
    </span>
  );
}
