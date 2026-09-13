import { describe, it, expect } from "vitest";
import { formatError } from "./describe-error";

/**
 * Reproduces the shape Drizzle actually throws: a DrizzleQueryError whose own
 * message is only the SQL, carrying the real driver error on `cause`. Before
 * this formatter existed the CLI printed the outer message alone, so a bad
 * password reported itself as an unexplained query failure.
 */
function drizzleWrapped(cause: unknown) {
  const err = new Error(
    'Failed query: select count(*) from "jobs" where "jobs"."status" = $1\nparams: active',
  ) as Error & { query?: string; params?: unknown; cause?: unknown };
  err.query = 'select count(*) from "jobs" where "jobs"."status" = $1';
  err.params = ["active"];
  err.cause = cause;
  return err;
}

function pgAuthError() {
  const err = new Error(
    'password authentication failed for user "postgres"',
  ) as Error & Record<string, unknown>;
  err.name = "error";
  err.code = "28P01";
  err.severity = "FATAL";
  err.routine = "auth_failed";
  return err;
}

describe("formatError", () => {
  it("surfaces the driver error that the outer message hides", () => {
    const out = formatError(drizzleWrapped(pgAuthError()), { stack: false });

    expect(out).toContain('password authentication failed for user "postgres"');
    expect(out).toContain("code: 28P01");
    expect(out).toContain("severity: FATAL");
    expect(out).toContain("caused by:");
  });

  it("labels the code even when the message already contains it", () => {
    // ECONNREFUSED appears inside the message; a reader scanning for `code:`
    // still has to find it.
    const sys = new Error("connect ECONNREFUSED 127.0.0.1:5432") as Error &
      Record<string, unknown>;
    sys.code = "ECONNREFUSED";
    sys.syscall = "connect";
    sys.address = "127.0.0.1";
    sys.port = 5432;

    const out = formatError(drizzleWrapped(sys), { stack: false });

    expect(out).toContain("code: ECONNREFUSED");
    expect(out).toContain("syscall: connect");
    expect(out).toContain("port: 5432");
  });

  it("does not print the SQL twice", () => {
    const out = formatError(drizzleWrapped(pgAuthError()), { stack: false });
    const sql = 'select count(*) from "jobs" where "jobs"."status" = $1';
    expect(out.split(sql).length - 1).toBe(1);
    expect(out.split("params: active").length - 1).toBe(1);
  });

  it("includes stack frames by default and omits the message from them", () => {
    const out = formatError(drizzleWrapped(pgAuthError()));
    expect(out).toMatch(/^\s+at /m);
    // The Drizzle message is two lines; a naive slice(1) left its second line
    // sitting in the stack, printing "params: active" a third time.
    expect(out.split("params: active").length - 1).toBe(1);
  });

  it("survives a non-Error being thrown", () => {
    expect(formatError("just a string")).toContain("just a string");
    expect(formatError(42)).toContain("42");
    expect(formatError(null)).toContain("Non-error thrown");
    expect(formatError(undefined)).toContain("Non-error thrown");
  });

  it("stops on a circular cause chain instead of looping forever", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;

    const out = formatError(a, { stack: false });
    expect(out).toContain("circular cause chain");
  });

  it("walks more than one level of cause", () => {
    const root = new Error("root cause");
    const middle = new Error("middle") as Error & { cause?: unknown };
    middle.cause = root;
    const top = new Error("top") as Error & { cause?: unknown };
    top.cause = middle;

    const out = formatError(top, { stack: false });
    expect(out).toContain("top");
    expect(out).toContain("middle");
    expect(out).toContain("root cause");
  });
});
