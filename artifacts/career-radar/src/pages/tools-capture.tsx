/**
 * Bookmarklet setup page (UPGRADE.md §4.3)
 * ─────────────────────────────────────────
 * One drag, then one click per posting. The bookmarklet reads `location.href`
 * and `window.getSelection()` IN THE USER'S OWN BROWSER, on a page they already
 * had open, and hands both to `/jobs?capture=1&…`. Nothing on the server ever
 * requests the board — which is what makes this the legitimate bridge to the
 * platforms that prohibit automated extraction.
 */

import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Check,
  Copy,
  MousePointerClick,
  Bookmark,
  ClipboardPaste,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Matches the cap in §4.3 — long enough for a JD's first screen, short enough for any browser. */
const MAX_URL_LENGTH = 1800;

/**
 * Built as one line because that is what a bookmarklet is. It trims the
 * selection down until the whole target URL fits under the cap, so a stray
 * Ctrl-A on a long posting still produces a working link rather than a
 * truncated one the router cannot read.
 *
 * NEWLINES ARE PRESERVED. Runs of spaces collapse and blank-line runs shrink,
 * but the line breaks themselves survive, at three URL-encoded characters
 * each. The server's heuristic parser reads a posting positionally — the title
 * on the first line, "Company · Location · when" on the second — so
 * flattening the selection to one line costs far more than the bytes it saves.
 */
function buildBookmarklet(target: string): string {
  const source = `(function(){
var b=${JSON.stringify(target)};
var u=location.href;
var s=(window.getSelection?window.getSelection().toString():'').replace(/\\r/g,'').replace(/[ \\t]+/g,' ').replace(/\\n{3,}/g,'\\n\\n').trim();
var room=${MAX_URL_LENGTH}-b.length-encodeURIComponent(u).length-25;
while(s.length>0&&encodeURIComponent(s).length>room){s=s.slice(0,Math.floor(s.length*0.9));}
window.open(b+'?capture=1&url='+encodeURIComponent(u)+'&text='+encodeURIComponent(s),'_blank');
})()`
    .split("\n")
    .join("");
  return `javascript:${encodeURI(source)}`;
}

function Step({
  n,
  title,
  icon: Icon,
  children,
}: {
  n: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <div className="flex flex-col gap-1.5 pt-0.5">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </h3>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

export function ToolsCapturePage() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);

  const target = useMemo(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${window.location.origin}${base}/jobs`;
  }, []);

  const bookmarklet = useMemo(() => buildBookmarklet(target), [target]);

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the drag path still works.
      setCopied(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 max-w-3xl">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight">
          Capture from anywhere
        </h1>
        <p className="text-sm text-muted-foreground">
          LinkedIn, Naukri, Internshala, Unstop and Wellfound do not allow
          automated collection, so CareerRadar never visits them. This
          bookmarklet copies the posting out of the tab you already have open
          and drops it into the Add-job form.
        </p>
      </div>

      {/* The bookmarklet itself */}
      <div className="rounded-lg border border-border bg-muted/30 p-5 flex flex-col items-start gap-3">
        <Badge variant="secondary" className="text-[10px]">
          Drag this to your bookmarks bar
        </Badge>
        {/*
          The href is set imperatively: React warns about (and will eventually
          block) a javascript: URL written as a prop, and this is the one place
          where a javascript: URL is the entire point.
        */}
        <a
          ref={(el) => {
            if (el) el.setAttribute("href", bookmarklet);
            linkRef.current = el;
          }}
          data-testid="capture-bookmarklet"
          onClick={(e) => e.preventDefault()}
          draggable
          className="inline-flex cursor-grab items-center gap-2 rounded-md border border-primary/30 bg-background px-4 py-2 text-sm font-semibold text-primary shadow-sm active:cursor-grabbing"
        >
          <Bookmark className="h-4 w-4" />
          Add to CareerRadar
        </a>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void copyBookmarklet()}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy the code instead"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {bookmarklet.length} characters
          </span>
        </div>
      </div>

      {/* Setup */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Setting it up</h2>
        <ol className="flex flex-col gap-4">
          <Step n={1} title="Show your bookmarks bar" icon={Bookmark}>
            In Chrome or Edge press{" "}
            <kbd className="rounded border border-border bg-muted px-1 text-[11px]">
              Ctrl
            </kbd>
            {" + "}
            <kbd className="rounded border border-border bg-muted px-1 text-[11px]">
              Shift
            </kbd>
            {" + "}
            <kbd className="rounded border border-border bg-muted px-1 text-[11px]">
              B
            </kbd>
            . On a Mac that is ⌘ + Shift + B.
          </Step>
          <Step
            n={2}
            title="Drag the button up to the bar"
            icon={MousePointerClick}
          >
            Drag{" "}
            <span className="font-medium text-foreground">
              Add to CareerRadar
            </span>{" "}
            onto the bookmarks bar. If dragging is awkward, use “Copy the code
            instead”, then create a bookmark by hand and paste it into the URL
            field.
          </Step>
          <Step
            n={3}
            title="Select the posting, then click it"
            icon={ClipboardPaste}
          >
            On any job page, select the description (
            <kbd className="rounded border border-border bg-muted px-1 text-[11px]">
              Ctrl
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-border bg-muted px-1 text-[11px]">
              A
            </kbd>{" "}
            works) and click the bookmark. CareerRadar opens in a new tab with
            the Add-job form already filled in — check it, then{" "}
            <span className="font-medium text-foreground">
              Save &amp; mark applied
            </span>
            .
          </Step>
        </ol>
      </div>

      {/* Caveats worth knowing before the first surprise */}
      <div className="rounded-lg border border-border p-4 flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Good to know</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
          <li>
            The link carries your selection in its query string, so it is capped
            at {MAX_URL_LENGTH.toLocaleString("en-IN")} characters. A very long
            selection is trimmed; paste the rest into the form if you need it.
          </li>
          <li>
            Selecting nothing still works — the URL alone fills in the role and
            the company on most boards.
          </li>
          <li>
            Nothing is saved until you press Save. The parse step only produces
            a draft.
          </li>
          <li>
            Prefer to paste by hand? The{" "}
            <Link href="/jobs" className="text-primary hover:underline">
              Add job
            </Link>{" "}
            button on the Jobs page opens the same form.
          </li>
        </ul>
      </div>
    </div>
  );
}

export default ToolsCapturePage;
