import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type {
  Application,
  ApplicationUpdateInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  DEADLINE_CLASSES,
  STATUS_LABELS,
  STATUS_ORDER,
  deadlineUrgency,
  formatDate,
  fromDateInputValue,
  toDateInputValue,
  type BoardStatus,
} from "./status";

interface ApplicationDrawerProps {
  application: Application | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: ApplicationUpdateInput) => Promise<void>;
  isSaving: boolean;
}

interface DraftState {
  status: BoardStatus;
  appliedDate: string;
  followUpDate: string;
  notes: string;
}

function draftFrom(application: Application): DraftState {
  return {
    status: application.status as BoardStatus,
    appliedDate: toDateInputValue(application.appliedDate),
    followUpDate: toDateInputValue(application.followUpDate),
    notes: application.notes ?? "",
  };
}

export function ApplicationDrawer({
  application,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: ApplicationDrawerProps) {
  const [draft, setDraft] = useState<DraftState | null>(null);

  // Re-seed whenever a different row is opened, and when the row's server copy
  // changes underneath an open drawer (e.g. a board drag moved its status).
  useEffect(() => {
    setDraft(application ? draftFrom(application) : null);
  }, [
    application?.id,
    application?.status,
    application?.appliedDate,
    application?.followUpDate,
    application?.notes,
  ]);

  if (!application || !draft) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md" />
      </Sheet>
    );
  }

  const job = application.job;
  const company = job?.company;
  const urgency = deadlineUrgency(job?.deadline);

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const handleSave = async () => {
    await onSave(application.id, {
      status: draft.status,
      appliedDate: fromDateInputValue(draft.appliedDate),
      followUpDate: fromDateInputValue(draft.followUpDate),
      notes: draft.notes,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="text-base leading-snug">
            {job?.title ?? "Application"}
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {company?.name ?? "—"}
            {job?.location ? ` · ${job.location}` : ""}
          </p>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-status" className="text-xs">
              Status
            </Label>
            <Select
              value={draft.status}
              onValueChange={(v) => set("status", v as BoardStatus)}
            >
              <SelectTrigger id="app-status" className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s} className="text-sm">
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-applied" className="text-xs">
              Applied date
            </Label>
            <Input
              id="app-applied"
              type="date"
              className="h-9 text-sm"
              value={draft.appliedDate}
              onChange={(e) => set("appliedDate", e.target.value)}
            />
          </div>

          {/*
            Deadline is read-only here on purpose. It lives on the shared jobs
            row, not on this application, so editing it from a per-application
            drawer would rewrite a record every other user of the job sees.
            UPGRADE.md section 1.4 lists it as editable; that is a spec error.
          */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Deadline</Label>
            <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3">
              <span className={`text-sm ${DEADLINE_CLASSES[urgency]}`}>
                {formatDate(job?.deadline)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Set by the job posting — not editable here.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-followup" className="text-xs">
              Next action date
            </Label>
            <Input
              id="app-followup"
              type="date"
              className="h-9 text-sm"
              value={draft.followUpDate}
              onChange={(e) => set("followUpDate", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="app-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="app-notes"
              rows={5}
              className="text-sm"
              placeholder="Recruiter name, OA platform, interview feedback…"
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {job?.applyUrl && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Source</Label>
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 break-all text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {job.applyUrl}
              </a>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-border pt-4">
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="gap-1.5"
          >
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
