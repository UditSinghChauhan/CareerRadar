/**
 * Quick capture dialog (UPGRADE.md §4.2)
 * ───────────────────────────────────────
 * Paste a link and the job description, press Parse, check the pre-filled form,
 * save. The boards that hold most of the relevant postings cannot legally be
 * scraped, so this is the bridge — and it has to be fast enough to use every
 * day, which means it must also work when nothing parses: every field is
 * editable, and Save is enabled as soon as there is a title and a company.
 *
 * Parse is an accelerator, never a gate. `POST /api/jobs/capture` returns a
 * draft whether or not GEMINI_API_KEY is configured on the server, and the
 * banner says which it was, so a wrong field is never a mystery.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, WandSparkles, Info } from "lucide-react";
import {
  useCaptureJob,
  useConfirmCapturedJob,
  type JobCaptureDraft,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Form state ───────────────────────────────────────────────────────────────

interface CaptureForm {
  title: string;
  companyName: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite";
  jobType: "internship" | "full_time";
  stipend: string;
  salaryMin: string;
  salaryMax: string;
  deadline: string;
  requiredSkills: string;
  description: string;
  applyUrl: string;
}

const EMPTY_FORM: CaptureForm = {
  title: "",
  companyName: "",
  location: "",
  workMode: "onsite",
  jobType: "internship",
  stipend: "",
  salaryMin: "",
  salaryMax: "",
  deadline: "",
  requiredSkills: "",
  description: "",
  applyUrl: "",
};

/** `<input type="date">` wants YYYY-MM-DD; the API speaks ISO-8601. */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/**
 * A date the user picked means "the end of that day" — the same convention the
 * server's own deadline parser uses, so a job due today does not vanish at
 * midnight when the expired-deadline sweep runs.
 */
function fromDateInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: string): number | null {
  const n = Number(value.replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function draftToForm(draft: JobCaptureDraft): CaptureForm {
  return {
    title: draft.title ?? "",
    companyName: draft.companyName ?? "",
    location: draft.location ?? "",
    workMode: draft.workMode ?? "onsite",
    jobType: draft.jobType ?? "internship",
    stipend: draft.stipend != null ? String(draft.stipend) : "",
    salaryMin: draft.salaryMin != null ? String(draft.salaryMin) : "",
    salaryMax: draft.salaryMax != null ? String(draft.salaryMax) : "",
    deadline: toDateInput(draft.deadline as string | null | undefined),
    requiredSkills: (draft.requiredSkills ?? []).join(", "),
    description: draft.description ?? "",
    applyUrl: draft.applyUrl ?? "",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface CaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fills the URL field — the bookmarklet's `?url=` lands here. */
  initialUrl?: string;
  /** Pre-fills the paste box — the bookmarklet's `?text=` lands here. */
  initialText?: string;
  /** Parse automatically on open. The bookmarklet path sets this. */
  autoParse?: boolean;
  /** Called after a successful save, with the new job's id. */
  onSaved?: (jobId: string, markApplied: boolean) => void;
}

export function CaptureDialog({
  open,
  onOpenChange,
  initialUrl = "",
  initialText = "",
  autoParse = false,
  onSaved,
}: CaptureDialogProps) {
  const [url, setUrl] = useState(initialUrl);
  const [rawText, setRawText] = useState(initialText);
  const [form, setForm] = useState<CaptureForm>(EMPTY_FORM);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string | null>(null);
  const [usedAI, setUsedAI] = useState(false);
  const [hasParsed, setHasParsed] = useState(false);

  const { mutateAsync: captureJob, isPending: parsing } = useCaptureJob();
  const { mutateAsync: confirmCapture, isPending: saving } =
    useConfirmCapturedJob();

  const set = useCallback(
    <K extends keyof CaptureForm>(key: K, value: CaptureForm[K]) =>
      setForm((f) => ({ ...f, [key]: value })),
    [],
  );

  const runParse = useCallback(
    async (parseUrl: string, parseText: string) => {
      if (!parseUrl.trim() && !parseText.trim()) {
        toast.error("Paste a link or the job description first");
        return;
      }
      try {
        const result = await captureJob({
          data: { url: parseUrl || null, rawText: parseText || null },
        });
        // Anything already typed wins: re-parsing must never wipe an edit. A
        // field still holding its default counts as untouched, which is what
        // lets a first parse fill the type and mode selects.
        setForm((current) => {
          const parsed = draftToForm(result.draft);
          const merged: CaptureForm = { ...parsed };
          for (const key of Object.keys(parsed) as Array<keyof CaptureForm>) {
            const edited = current[key];
            if (edited && edited !== EMPTY_FORM[key]) {
              Object.assign(merged, { [key]: edited });
            }
          }
          return merged;
        });
        setWarnings(result.warnings ?? []);
        setPlatform(result.platform ?? null);
        setUsedAI(result.source === "gemini");
        setHasParsed(true);
      } catch {
        toast.error("Could not parse that posting — fill the form in by hand");
        setHasParsed(true);
      }
    },
    [captureJob],
  );

  // Reset on every open so a second capture never inherits the first one's
  // fields, then run the bookmarklet's automatic parse.
  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setRawText(initialText);
    setForm(EMPTY_FORM);
    setWarnings([]);
    setPlatform(null);
    setUsedAI(false);
    setHasParsed(false);
    if (autoParse && (initialUrl || initialText)) {
      void runParse(initialUrl, initialText);
    }
  }, [open, initialUrl, initialText, autoParse, runParse]);

  const canSave =
    form.title.trim().length > 0 && form.companyName.trim().length > 0;

  async function handleSave(markApplied: boolean) {
    if (!canSave) return;
    try {
      const result = await confirmCapture({
        data: {
          title: form.title.trim(),
          companyName: form.companyName.trim(),
          location: form.location.trim() || null,
          workMode: form.workMode,
          jobType: form.jobType,
          stipend: toNumber(form.stipend),
          salaryMin: toNumber(form.salaryMin),
          salaryMax: toNumber(form.salaryMax),
          deadline: fromDateInput(form.deadline),
          requiredSkills: form.requiredSkills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          description: form.description.trim() || rawText.trim() || null,
          applyUrl: form.applyUrl.trim() || url.trim() || null,
          sourceUrl: url.trim() || form.applyUrl.trim() || null,
        },
      });

      toast.success(
        result.duplicate
          ? "That posting was already tracked — opened the existing one"
          : markApplied
            ? "Saved and marked as applied"
            : "Job saved",
      );
      onOpenChange(false);
      onSaved?.(result.job.id, markApplied);
    } catch {
      toast.error("Could not save that job");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="capture-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Add a job
            {platform ? (
              <Badge
                variant="secondary"
                className="text-[10px]"
                data-testid="capture-platform"
              >
                {platform}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Paste the link and the job description. Nothing is fetched from the
            site — only what you paste here is read.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* ── Input ───────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="capture-url" className="text-xs">
              Job URL
            </Label>
            <Input
              id="capture-url"
              data-testid="capture-url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="capture-text" className="text-xs">
              Job description
            </Label>
            <Textarea
              id="capture-text"
              data-testid="capture-text"
              placeholder="Select the whole posting on the site, copy, and paste it here."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
              className="text-sm resize-y"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1.5"
              data-testid="capture-parse"
              disabled={parsing}
              onClick={() => void runParse(url, rawText)}
            >
              {parsing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <WandSparkles className="h-3.5 w-3.5" />
              )}
              {parsing ? "Parsing..." : "Parse"}
            </Button>
            {hasParsed && usedAI ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Filled in by AI — check it
              </span>
            ) : null}
          </div>

          {warnings.length > 0 && (
            <div
              className="flex gap-2 rounded-md border border-border bg-muted/50 p-2.5 text-xs text-muted-foreground"
              data-testid="capture-warnings"
            >
              <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <ul className="flex flex-col gap-1">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ── The editable draft ──────────────────────────────────────── */}
          <div className="border-t border-border pt-4 flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-title" className="text-xs">
                  Role title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="capture-title"
                  data-testid="capture-title"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-company" className="text-xs">
                  Company <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="capture-company"
                  data-testid="capture-company"
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-location" className="text-xs">
                  Location
                </Label>
                <Input
                  id="capture-location"
                  data-testid="capture-location"
                  placeholder="Gurugram, Haryana"
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={form.jobType}
                    onValueChange={(v) =>
                      set("jobType", v as CaptureForm["jobType"])
                    }
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      data-testid="capture-job-type"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internship">Internship</SelectItem>
                      <SelectItem value="full_time">Full-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Mode</Label>
                  <Select
                    value={form.workMode}
                    onValueChange={(v) =>
                      set("workMode", v as CaptureForm["workMode"])
                    }
                  >
                    <SelectTrigger
                      className="h-9 text-sm"
                      data-testid="capture-work-mode"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="onsite">Onsite</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-stipend" className="text-xs">
                  Stipend (₹/month)
                </Label>
                <Input
                  id="capture-stipend"
                  data-testid="capture-stipend"
                  inputMode="numeric"
                  value={form.stipend}
                  onChange={(e) => set("stipend", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-salary-min" className="text-xs">
                  Salary min (₹/year)
                </Label>
                <Input
                  id="capture-salary-min"
                  inputMode="numeric"
                  value={form.salaryMin}
                  onChange={(e) => set("salaryMin", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-salary-max" className="text-xs">
                  Salary max (₹/year)
                </Label>
                <Input
                  id="capture-salary-max"
                  inputMode="numeric"
                  value={form.salaryMax}
                  onChange={(e) => set("salaryMax", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-deadline" className="text-xs">
                  Deadline
                </Label>
                <Input
                  id="capture-deadline"
                  data-testid="capture-deadline"
                  type="date"
                  value={form.deadline}
                  onChange={(e) => set("deadline", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="capture-skills" className="text-xs">
                  Skills (comma separated)
                </Label>
                <Input
                  id="capture-skills"
                  data-testid="capture-skills"
                  value={form.requiredSkills}
                  onChange={(e) => set("requiredSkills", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="capture-save"
            disabled={!canSave || saving}
            onClick={() => void handleSave(false)}
          >
            Save
          </Button>
          {/* Primary, per §4.2: the common case is capturing something being
              applied to right now. */}
          <Button
            size="sm"
            data-testid="capture-save-applied"
            disabled={!canSave || saving}
            onClick={() => void handleSave(true)}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : null}
            Save &amp; mark applied
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
