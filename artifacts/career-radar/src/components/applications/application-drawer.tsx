import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type {
  Application,
  ApplicationReferralStatus,
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

/**
 * Phase 6.1. The type comes from the generated contract, so a value added to
 * openapi.yaml and not given a label here fails the build rather than
 * rendering a blank option.
 */
type ReferralStatus = ApplicationReferralStatus;

const REFERRAL_STATUS_ORDER = [
  "none",
  "requested",
  "received",
  "declined",
] as const satisfies readonly ReferralStatus[];

const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  none: "Not asked",
  requested: "Requested",
  received: "Received",
  declined: "Declined",
};

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
  // ── Phase 6.1 ──
  // `referralName` is section 6.1's `contactName`; the column predates the
  // phase and is reused rather than duplicated. Labelled "Contact name" here.
  referralName: string;
  contactUrl: string;
  referralStatus: ReferralStatus;
  outreachNotes: string;
}

function draftFrom(application: Application): DraftState {
  return {
    status: application.status as BoardStatus,
    appliedDate: toDateInputValue(application.appliedDate),
    followUpDate: toDateInputValue(application.followUpDate),
    notes: application.notes ?? "",
    referralName: application.referralName ?? "",
    contactUrl: application.contactUrl ?? "",
    referralStatus: application.referralStatus,
    outreachNotes: application.outreachNotes ?? "",
  };
}

/**
 * An emptied text box means "clear this field", which is `null` on the wire —
 * not `""`, which would store an empty string, and not `undefined`, which the
 * server reads as "leave it alone" and would make the value impossible to
 * erase.
 */
function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
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
    application?.referralName,
    application?.contactUrl,
    application?.referralStatus,
    application?.outreachNotes,
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
      notes: textOrNull(draft.notes),
      referralName: textOrNull(draft.referralName),
      contactUrl: textOrNull(draft.contactUrl),
      referralStatus: draft.referralStatus,
      outreachNotes: textOrNull(draft.outreachNotes),
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

          {/*
            Phase 6.1 — referral and outreach. Grouped and separated from the
            pipeline fields above because it is a different question: those
            record where the application is, these record who is being asked to
            help it along.
          */}
          <div className="mt-2 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold text-foreground">
              Referral
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-referral-status" className="text-xs">
                  Referral status
                </Label>
                <Select
                  value={draft.referralStatus}
                  onValueChange={(v) =>
                    set("referralStatus", v as ReferralStatus)
                  }
                >
                  <SelectTrigger
                    id="app-referral-status"
                    className="h-9 text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_STATUS_ORDER.map((r) => (
                      <SelectItem key={r} value={r} className="text-sm">
                        {REFERRAL_STATUS_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-contact-name" className="text-xs">
                  Contact name
                </Label>
                <Input
                  id="app-contact-name"
                  className="h-9 text-sm"
                  placeholder="Who you asked"
                  value={draft.referralName}
                  onChange={(e) => set("referralName", e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="app-contact-url" className="text-xs">
                  Contact profile
                </Label>
                <Input
                  id="app-contact-url"
                  type="url"
                  className="h-9 text-sm"
                  placeholder="https://www.linkedin.com/in/…"
                  value={draft.contactUrl}
                  onChange={(e) => set("contactUrl", e.target.value)}
                />
                {draft.contactUrl.trim() !== "" && (
                  <a
                    href={draft.contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 break-all text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    Open profile
                  </a>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {/*
                  "Outreach log", not "Outreach notes". Two fields whose names
                  both end in "notes" are ambiguous to anyone reading the form
                  and to anything addressing it by accessible name — an
                  existing spec's getByLabel("Notes") matched both. "Log" also
                  describes it better: what was sent, when, and what came back.
                  The column stays `outreach_notes`.
                */}
                <Label htmlFor="app-outreach" className="text-xs">
                  Outreach log
                </Label>
                <Textarea
                  id="app-outreach"
                  rows={3}
                  className="text-sm"
                  placeholder="What you sent, when, and what came back…"
                  value={draft.outreachNotes}
                  onChange={(e) => set("outreachNotes", e.target.value)}
                />
              </div>
            </div>
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
