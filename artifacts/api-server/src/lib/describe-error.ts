/**
 * Readable diagnostics for a thrown value.
 * ─────────────────────────────────────────
 * Drizzle wraps every driver failure in a `DrizzleQueryError` whose message is
 * only the SQL it tried to run:
 *
 *   Failed query: select count(*) from "jobs" where "jobs"."status" = $1
 *   params: active
 *
 * The thing you actually need — `28P01 password authentication failed`, or
 * `ENOTFOUND` for a host that does not resolve — is on `error.cause`, and a
 * handler that logs `err.message` throws it away. That is how a CLI ends up
 * reporting a connection failure as a query failure with no reason attached.
 *
 * `formatError` walks the `cause` chain and prints, for every link, the fields
 * that are actually diagnostic: pg's SQLSTATE and detail, Node's syscall and
 * address, Drizzle's query and params, plus stacks.
 */

/**
 * Fields worth printing when present. Drawn from pg's `DatabaseError`, Node's
 * `SystemError` (ENOTFOUND / ECONNREFUSED / ETIMEDOUT) and Drizzle's
 * `DrizzleQueryError`. Anything absent or blank is skipped.
 */
const DIAGNOSTIC_FIELDS = [
  // pg
  "code",
  "severity",
  "detail",
  "hint",
  "constraint",
  "schema",
  "table",
  "column",
  "routine",
  // node
  "errno",
  "syscall",
  "hostname",
  "address",
  "port",
  // drizzle
  "query",
  "params",
] as const;

/**
 * Fields long enough that repeating them is noise, and which drivers tend to
 * embed in the message anyway — Drizzle builds its message out of exactly these
 * two. Every other field is always labelled, even when the message happens to
 * contain it: `code` is what you grep for, and it has to be findable as `code:`.
 */
const DEDUPE_AGAINST_MESSAGE = new Set<string>(["query", "params"]);

/** Guards against a self-referential or absurdly deep cause chain. */
const MAX_CAUSE_DEPTH = 5;

function fieldsOf(err: object, message: string): string[] {
  const lines: string[] = [];
  for (const key of DIAGNOSTIC_FIELDS) {
    const value = (err as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") continue;
    const rendered = Array.isArray(value)
      ? value.map((v) => String(v)).join(", ")
      : String(value);
    if (rendered.trim() === "") continue;
    // Drizzle builds its message out of `query` and `params`, so listing them
    // again would print the SQL twice.
    if (DEDUPE_AGAINST_MESSAGE.has(key) && message.includes(rendered)) continue;
    lines.push(
      `${key}: ${rendered.replace(/\n/g, "\n" + " ".repeat(key.length + 2))}`,
    );
  }
  return lines;
}

/**
 * The `at ...` frames of a stack, without the message that precedes them.
 *
 * `stack.split("\n").slice(1)` is not enough: a DrizzleQueryError message is
 * itself two lines ("Failed query: ..." then "params: ..."), so dropping one
 * line leaves half the message masquerading as a stack frame.
 */
function stackFrames(stack: string): string[] {
  return stack
    .split("\n")
    .filter((line) => /^\s*at /.test(line))
    .map((line) => line.trim());
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}

/**
 * Render a thrown value as a multi-line diagnostic block.
 *
 * @param err        the caught value — may be anything, including a non-Error
 * @param opts.stack include stacks (default true; off makes tests readable)
 */
export function formatError(
  err: unknown,
  opts: { stack?: boolean } = {},
): string {
  const withStack = opts.stack !== false;
  const out: string[] = [];
  const seen = new Set<unknown>();

  let current: unknown = err;
  let depth = 0;

  while (
    current !== undefined &&
    current !== null &&
    depth <= MAX_CAUSE_DEPTH
  ) {
    if (seen.has(current)) {
      out.push(indent("(circular cause chain — stopping here)", "  "));
      break;
    }
    seen.add(current);

    const pad = "  ".repeat(depth + 1);
    const label = depth === 0 ? "" : "caused by: ";

    if (typeof current !== "object") {
      // Someone threw a string, a number, or undefined.
      out.push(indent(`${label}${typeof current}: ${String(current)}`, pad));
      break;
    }

    const asError = current as Error & { cause?: unknown };
    const name = asError.name || current.constructor?.name || "Error";
    const message = asError.message ?? String(current);
    out.push(indent(`${label}${name}: ${message}`, pad));

    for (const line of fieldsOf(current, message)) {
      out.push(indent(line, pad + "  "));
    }

    if (withStack && typeof asError.stack === "string") {
      for (const frame of stackFrames(asError.stack)) {
        out.push(indent(frame, pad + "    "));
      }
    }

    current = asError.cause;
    depth++;
  }

  if (out.length === 0) {
    // `throw undefined` / `throw null` reach here.
    out.push(indent(`Non-error thrown: ${String(err)}`, "  "));
  }

  return out.join("\n");
}
