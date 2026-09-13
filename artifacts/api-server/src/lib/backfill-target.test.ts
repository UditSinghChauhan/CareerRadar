import { describe, it, expect } from "vitest";
import {
  AbortedError,
  confirmationMatchesHost,
  resolveDatabaseTarget,
  UsageError,
} from "./backfill-target";

const LOCAL = "postgresql://postgres:pw@localhost:5432/careerradar";
const NEON =
  "postgresql://neondb_owner:pw@ep-cool-bird-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

/**
 * These branches are the last thing between a mistyped shell history entry and a
 * bulk close against the deployed database, so every row of the policy table in
 * backfill-target.ts has a test — the refusals especially.
 */
describe("resolveDatabaseTarget", () => {
  describe("local database", () => {
    it("reports without ceremony", () => {
      const target = resolveDatabaseTarget({
        databaseUrl: LOCAL,
        allowRemote: false,
        write: false,
        interactive: true,
      });
      expect(target).toEqual({
        host: "localhost",
        isLocal: true,
        requiresTypedConfirmation: false,
      });
    });

    it("writes on --yes alone, with no typed confirmation", () => {
      const target = resolveDatabaseTarget({
        databaseUrl: LOCAL,
        allowRemote: false,
        write: true,
        interactive: true,
      });
      expect(target.requiresTypedConfirmation).toBe(false);
    });

    it("writes non-interactively — a local close needs no TTY", () => {
      const target = resolveDatabaseTarget({
        databaseUrl: LOCAL,
        allowRemote: false,
        write: true,
        interactive: false,
      });
      expect(target.isLocal).toBe(true);
      expect(target.requiresTypedConfirmation).toBe(false);
    });

    it("treats a Unix-socket URL as local", () => {
      expect(
        resolveDatabaseTarget({
          databaseUrl: "postgresql:///careerradar",
          allowRemote: false,
          write: true,
          interactive: false,
        }).isLocal,
      ).toBe(true);
    });
  });

  describe("remote database", () => {
    it("refuses without --allow-remote, naming the host", () => {
      expect(() =>
        resolveDatabaseTarget({
          databaseUrl: NEON,
          allowRemote: false,
          write: false,
          interactive: true,
        }),
      ).toThrow(UsageError);

      try {
        resolveDatabaseTarget({
          databaseUrl: NEON,
          allowRemote: false,
          write: false,
          interactive: true,
        });
        expect.unreachable("should have refused");
      } catch (err) {
        expect((err as Error).message).toContain(
          "ep-cool-bird-12345.ap-southeast-1.aws.neon.tech",
        );
        expect((err as Error).message).toContain("--allow-remote");
      }
    });

    it("refuses a remote write even when --allow-remote is absent", () => {
      expect(() =>
        resolveDatabaseTarget({
          databaseUrl: NEON,
          allowRemote: false,
          write: true,
          interactive: true,
        }),
      ).toThrow(UsageError);
    });

    it("allows a read-only report with --allow-remote", () => {
      const target = resolveDatabaseTarget({
        databaseUrl: NEON,
        allowRemote: true,
        write: false,
        interactive: true,
      });
      expect(target).toEqual({
        host: "ep-cool-bird-12345.ap-southeast-1.aws.neon.tech",
        isLocal: false,
        requiresTypedConfirmation: false,
      });
    });

    it("reports with --allow-remote even without a TTY — reading is not writing", () => {
      const target = resolveDatabaseTarget({
        databaseUrl: NEON,
        allowRemote: true,
        write: false,
        interactive: false,
      });
      expect(target.isLocal).toBe(false);
      expect(target.requiresTypedConfirmation).toBe(false);
    });

    it("demands a typed confirmation for --allow-remote --yes", () => {
      const target = resolveDatabaseTarget({
        databaseUrl: NEON,
        allowRemote: true,
        write: true,
        interactive: true,
      });
      expect(target.requiresTypedConfirmation).toBe(true);
    });

    it("refuses --allow-remote --yes outright when stdin is not a TTY", () => {
      try {
        resolveDatabaseTarget({
          databaseUrl: NEON,
          allowRemote: true,
          write: true,
          interactive: false,
        });
        expect.unreachable("should have refused");
      } catch (err) {
        expect(err).toBeInstanceOf(UsageError);
        expect((err as Error).message).toContain("not a TTY");
        expect((err as Error).message).toContain(
          "ep-cool-bird-12345.ap-southeast-1.aws.neon.tech",
        );
      }
    });

    it("refuses an unparseable DATABASE_URL — an unreadable target is not a safe one", () => {
      expect(() =>
        resolveDatabaseTarget({
          databaseUrl: "not a url",
          allowRemote: false,
          write: false,
          interactive: true,
        }),
      ).toThrow(UsageError);
    });

    it("refuses a host that merely looks local", () => {
      for (const url of [
        "postgresql://u:p@localhost.evil.example/db",
        "postgresql://localhost:pw@db.example.com/prod",
      ]) {
        expect(() =>
          resolveDatabaseTarget({
            databaseUrl: url,
            allowRemote: false,
            write: false,
            interactive: true,
          }),
        ).toThrow(UsageError);
      }
    });
  });

  it("refuses when DATABASE_URL is unset", () => {
    expect(() =>
      resolveDatabaseTarget({
        databaseUrl: undefined,
        allowRemote: true,
        write: false,
        interactive: true,
      }),
    ).toThrow(/DATABASE_URL is not set/);
  });
});

describe("confirmationMatchesHost", () => {
  const host = "ep-cool-bird-12345.ap-southeast-1.aws.neon.tech";

  it("accepts the host name, with pasted whitespace and any casing", () => {
    expect(confirmationMatchesHost(host, host)).toBe(true);
    expect(confirmationMatchesHost(`  ${host}\t`, host)).toBe(true);
    expect(confirmationMatchesHost(host.toUpperCase(), host)).toBe(true);
  });

  it("rejects a keystroke — that is the entire point of asking for the host", () => {
    for (const typed of [
      "y",
      "yes",
      "Y",
      "",
      "   ",
      "neon",
      host.slice(0, -1),
    ]) {
      expect(confirmationMatchesHost(typed, host)).toBe(false);
    }
  });

  it("rejects a different host", () => {
    expect(confirmationMatchesHost("localhost", host)).toBe(false);
  });
});

describe("AbortedError", () => {
  it("is a UsageError, so a declined confirmation prints a sentence not a stack", () => {
    expect(new AbortedError("nope")).toBeInstanceOf(UsageError);
    expect(new AbortedError("nope").name).toBe("AbortedError");
  });
});
