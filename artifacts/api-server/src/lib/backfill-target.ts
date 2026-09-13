/**
 * Where is a destructive script allowed to point, and what does it have to ask
 * for first?
 * ───────────────────────────────────────────────────────────────────────────
 * `database-url.ts` answers "which host is this?". This module answers the
 * follow-up: given that host and the flags on the command line, may this run
 * proceed, and does it owe the operator a confirmation before writing.
 *
 * It is deliberately pure — no env reads, no prompting, no queries — so every
 * branch is testable, including the ones that must refuse. The refusals here
 * are the only thing between a mistyped shell history entry and a bulk close
 * against the deployed database, whose rows the upstream job APIs cannot
 * re-supply.
 *
 * The policy, in one table:
 *
 *   host    flags                          result
 *   ─────── ────────────────────────────── ──────────────────────────────────
 *   local   (none)                         report
 *   local   --yes                          write
 *   remote  (none)                         REFUSED
 *   remote  --allow-remote                 report, after a loud warning
 *   remote  --allow-remote --yes, TTY      write, after typing the host name
 *   remote  --allow-remote --yes, no TTY   REFUSED
 *
 * `--allow-remote` on its own never writes: it is the flag that buys a reading
 * of production, not a licence to change it.
 */

import { describeDatabaseTarget, isLocalDatabaseUrl } from "./database-url";

/**
 * An error whose message is the whole story. These print as a sentence — a
 * stack trace on "you typed --dayz" is noise that buries the line that helps.
 */
export class UsageError extends Error {
  override readonly name: string = "UsageError";
}

/** The operator was asked to confirm and did not. Same presentation, different cause. */
export class AbortedError extends UsageError {
  override readonly name = "AbortedError";
}

export interface DatabaseTarget {
  /** The resolved host, as it should appear in warnings and prompts. */
  host: string;
  isLocal: boolean;
  /**
   * True when the caller must collect a typed confirmation of `host` before it
   * writes anything. Only ever set for a remote write.
   */
  requiresTypedConfirmation: boolean;
}

export interface ResolveDatabaseTargetArgs {
  /** Raw DATABASE_URL, exactly as read from the environment. */
  databaseUrl: string | undefined;
  /** `--allow-remote` was given. */
  allowRemote: boolean;
  /** `--yes` was given, i.e. this run intends to close rows. */
  write: boolean;
  /** Whether stdin can actually be prompted (`process.stdin.isTTY`). */
  interactive: boolean;
}

/**
 * Decide whether this invocation may proceed, before any query runs.
 *
 * Throws `UsageError` for every refusal, so the caller can print one sentence
 * and exit non-zero without a stack trace.
 */
export function resolveDatabaseTarget(
  args: ResolveDatabaseTargetArgs,
): DatabaseTarget {
  const { databaseUrl, allowRemote, write, interactive } = args;

  if (!databaseUrl) {
    throw new UsageError(
      "DATABASE_URL is not set. This script needs a database to run against.",
    );
  }

  const host = describeDatabaseTarget(databaseUrl);

  if (isLocalDatabaseUrl(databaseUrl)) {
    return { host, isLocal: true, requiresTypedConfirmation: false };
  }

  if (!allowRemote) {
    throw new UsageError(
      `Refusing to run: DATABASE_URL points at "${host}", not localhost.\n` +
        "  This script closes job rows in bulk, and the deployed database holds live\n" +
        "  postings that the provider APIs cannot re-supply.\n" +
        "\n" +
        "  Point DATABASE_URL at a local Postgres, or pass --allow-remote to take a\n" +
        "  read-only reading of this host. --allow-remote alone never writes.",
    );
  }

  if (!write) {
    return { host, isLocal: false, requiresTypedConfirmation: false };
  }

  if (!interactive) {
    throw new UsageError(
      `Refusing to close rows on "${host}": --allow-remote --yes requires an\n` +
        "  interactive terminal, and stdin is not a TTY.\n" +
        "\n" +
        "  A remote close has to be confirmed by typing the host name, and there is\n" +
        "  no non-interactive way to give that confirmation — piping a 'yes' into\n" +
        "  this script is exactly the accident the confirmation exists to stop.",
    );
  }

  return { host, isLocal: false, requiresTypedConfirmation: true };
}

/**
 * Does what the operator typed name the host they are about to mutate?
 *
 * Whitespace is trimmed because a terminal paste often brings a trailing space,
 * and the comparison is case-insensitive because DNS is. Nothing else is
 * accepted: "y" is not a confirmation, which is the entire point of asking for
 * the host instead of a keystroke.
 */
export function confirmationMatchesHost(typed: string, host: string): boolean {
  return typed.trim().toLowerCase() === host.trim().toLowerCase();
}
