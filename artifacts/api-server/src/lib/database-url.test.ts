import { describe, it, expect } from "vitest";
import {
  databaseHost,
  describeDatabaseTarget,
  isLocalDatabaseUrl,
} from "./database-url";

/**
 * The backfill script refuses to run against anything but a local database.
 * Both sides of that decision are tested here: what must be allowed through,
 * and what must be stopped. A rail that only ever gets tested on the happy
 * path is a rail nobody knows the shape of.
 */
describe("isLocalDatabaseUrl — accepts local targets", () => {
  const local = [
    "postgresql://postgres:pw@localhost:5432/careerradar",
    "postgres://postgres:pw@localhost/careerradar",
    "postgresql://postgres:pw@127.0.0.1:5432/careerradar",
    "postgresql://postgres:pw@[::1]:5432/careerradar",
    "postgresql://postgres:pw@0.0.0.0:5432/careerradar",
    // Percent-encoded password — must not confuse host extraction.
    "postgresql://postgres:p%40ss%3Aword@localhost:5432/careerradar",
    // Upper case is still localhost.
    "postgresql://postgres:pw@LOCALHOST:5432/careerradar",
  ];

  it.each(local)("allows %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true);
  });

  it("treats a host-less socket URL as local — it cannot reach a hosted database", () => {
    expect(isLocalDatabaseUrl("postgresql:///careerradar")).toBe(true);
    expect(describeDatabaseTarget("postgresql:///careerradar")).toBe(
      "a local Unix socket",
    );
  });
});

describe("isLocalDatabaseUrl — refuses everything else", () => {
  const remote = [
    "postgresql://u:p@ep-cool-name-12345.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
    "postgresql://u:p@db.example.com:5432/prod",
    "postgresql://u:p@10.0.0.5:5432/prod",
    "postgresql://u:p@careerradar.internal/prod",
    // Looks local, is not: localhost as a subdomain of someone else's domain.
    "postgresql://u:p@localhost.evil.example/prod",
    // Looks local, is not: the host is the part after @.
    "postgresql://localhost:pw@db.example.com/prod",
  ];

  it.each(remote)("refuses %s", (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false);
  });

  it("refuses an unparseable connection string — an unreadable target is not a safe one", () => {
    expect(isLocalDatabaseUrl("not a url at all")).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
    expect(describeDatabaseTarget("not a url at all")).toBe(
      "an unparseable DATABASE_URL",
    );
  });
});

describe("databaseHost", () => {
  it("strips the brackets URL syntax puts around an IPv6 host", () => {
    expect(databaseHost("postgresql://u:p@[::1]:5432/db")).toBe("::1");
  });

  it("names the host for an error message", () => {
    expect(
      describeDatabaseTarget("postgresql://u:p@ep-x.aws.neon.tech/neondb"),
    ).toBe("ep-x.aws.neon.tech");
  });

  it("returns null when there is no host", () => {
    expect(databaseHost("postgresql:///db")).toBeNull();
    expect(databaseHost("nonsense")).toBeNull();
  });
});
