import type { ReactNode } from "react";

/**
 * One page header for every signed-in screen, in the landing's type: the
 * title at 28px, weight 500, tight tracking; one line under it; actions on
 * the right on wide screens, below on narrow ones.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-[28px] font-medium leading-[1.15] tracking-[-0.03em] text-balance">
          {title}
        </h1>
        {description && (
          <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
