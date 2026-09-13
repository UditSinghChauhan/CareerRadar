import { describe, it, expect } from "vitest";
import { normalizeConnectionString } from "@workspace/db/connection-string";

/**
 * pg warns on every connection that `sslmode=require` — which is what Neon's
 * connection string carries — will change meaning in pg 9. We pin it to what it
 * means today, `verify-full`, which is the option the warning itself recommends
 * for keeping current behaviour.
 */
describe("normalizeConnectionString", () => {
  it.each(["require", "prefer", "verify-ca"])(
    "pins sslmode=%s to verify-full",
    (mode) => {
      const out = normalizeConnectionString(
        `postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=${mode}`,
      );
      expect(out).toContain("sslmode=verify-full");
      expect(out).not.toContain(`sslmode=${mode}`);
    },
  );

  it("keeps the rest of the connection string intact", () => {
    const out = normalizeConnectionString(
      "postgresql://user:p%40ss@ep-x.aws.neon.tech:5432/neondb?sslmode=require&application_name=careerradar",
    );
    expect(out).toContain("user:p%40ss@ep-x.aws.neon.tech:5432");
    expect(out).toContain("/neondb");
    expect(out).toContain("application_name=careerradar");
  });

  it("leaves an already-explicit sslmode alone", () => {
    const url = "postgresql://u:p@host/db?sslmode=verify-full";
    expect(normalizeConnectionString(url)).toBe(url);
    const disabled = "postgresql://u:p@host/db?sslmode=disable";
    expect(normalizeConnectionString(disabled)).toBe(disabled);
  });

  it("leaves a connection string with no sslmode alone", () => {
    const url = "postgresql://postgres:pw@localhost:5432/careerradar";
    expect(normalizeConnectionString(url)).toBe(url);
  });

  it("respects an explicit libpq opt-in rather than overriding the caller", () => {
    const url = "postgresql://u:p@host/db?sslmode=require&uselibpqcompat=true";
    expect(normalizeConnectionString(url)).toBe(url);
  });

  it("passes through anything it cannot parse", () => {
    expect(normalizeConnectionString("not a url")).toBe("not a url");
    expect(normalizeConnectionString("")).toBe("");
  });
});
