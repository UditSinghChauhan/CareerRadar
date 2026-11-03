import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import {
  PreferredLocation,
  RolePreference,
  type Profile,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one onboarding question, in two parts: which roles, and where. Shared
 * by /welcome (right after sign-up) and Settings, so the answer can be
 * changed later with the same control. Nothing here is required: the
 * defaults, "Both" and "Anywhere in India", are a complete answer.
 */

type Role = (typeof RolePreference)[keyof typeof RolePreference];
type Place = (typeof PreferredLocation)[keyof typeof PreferredLocation];

export const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: "internship", label: "Internships" },
  { value: "new_grad", label: "New grad roles" },
  { value: "both", label: "Both" },
];

export const PLACE_OPTIONS: Array<{ value: Place; label: string }> = [
  { value: "anywhere", label: "Anywhere in India" },
  { value: "remote", label: "Remote" },
  { value: "Bengaluru", label: "Bengaluru" },
  { value: "Hyderabad", label: "Hyderabad" },
  { value: "Pune", label: "Pune" },
  { value: "Chennai", label: "Chennai" },
  { value: "NCR", label: "Delhi NCR" },
  { value: "MMR", label: "Mumbai" },
  { value: "Kolkata", label: "Kolkata" },
  { value: "Ahmedabad", label: "Ahmedabad" },
];

export type Preferences = { role: Role; places: Place[] };

export function preferencesFrom(profile: Profile | undefined): Preferences {
  const places = (profile?.preferredLocations ?? []) as Place[];
  return {
    role: (profile?.rolePreference as Role | null | undefined) ?? "both",
    places: places.length > 0 ? places : ["anywhere"],
  };
}

/**
 * "Anywhere in India" already includes every city and remote, so it stands
 * alone; picking a city or Remote replaces it, and clearing the last one
 * brings it back.
 */
export function togglePlace(places: Place[], place: Place): Place[] {
  if (place === "anywhere") return ["anywhere"];
  const rest = places.filter((p) => p !== "anywhere");
  const next = rest.includes(place)
    ? rest.filter((p) => p !== place)
    : [...rest, place];
  return next.length > 0 ? next : ["anywhere"];
}

const chip =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium " +
  "transition-[background-color,border-color,color,scale] duration-150 ease-out active:scale-[0.98] " +
  "motion-reduce:transition-none motion-reduce:active:scale-100";
const chipOff =
  "border-border bg-card text-foreground hover:border-[var(--rule-2)] hover:bg-secondary";
const chipOn = "border-foreground bg-foreground text-background";

export function PreferencesForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial: Preferences;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (value: Preferences) => void;
}) {
  const [role, setRole] = useState<Role>(initial.role);
  const [places, setPlaces] = useState<Place[]>(initial.places);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ role, places });
  };

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          What are you looking for?
        </legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {ROLE_OPTIONS.map((o) => {
            const on = role === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setRole(o.value)}
                className={cn(chip, on ? chipOn : chipOff)}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-foreground">
          Where would you work?
        </legend>
        <p className="text-sm text-muted-foreground">
          Pick as many as you like. Roles there come first.
        </p>
        <div className="flex flex-wrap gap-2">
          {PLACE_OPTIONS.map((o) => {
            const on = places.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => setPlaces((p) => togglePlace(p, o.value))}
                className={cn(chip, on ? chipOn : chipOff)}
              >
                {on && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-3">
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="w-full sm:w-auto"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
