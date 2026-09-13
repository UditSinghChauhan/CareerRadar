import { describe, it, expect } from "vitest";
import {
  diagnoseConnection,
  formatDiagnosis,
  isConnectionFailure,
  type ConnectionDiagnosis,
} from "./connection-diagnosis";

describe("isConnectionFailure", () => {
  it("recognises the errno codes that mean we never reached the database", () => {
    for (const code of [
      "ETIMEDOUT",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "EAI_AGAIN",
    ]) {
      expect(
        isConnectionFailure(Object.assign(new Error("nope"), { code })),
      ).toBe(true);
    }
  });

  it("recognises pg's own connect deadline, which carries no code at all", () => {
    // This is what connectionTimeoutMillis rejects with: a bare Error, no code,
    // no address. Recognising it by message is the only option.
    expect(isConnectionFailure(new Error("timeout expired"))).toBe(true);
  });

  it("looks down the cause chain, where Drizzle puts the real error", () => {
    const driverError = Object.assign(
      new Error("connect ETIMEDOUT 1.2.3.4:5432"),
      {
        code: "ETIMEDOUT",
      },
    );
    const wrapped = new Error("Failed query: select ...", {
      cause: driverError,
    });
    expect(isConnectionFailure(wrapped)).toBe(true);
  });

  it("does not fire for a database that answered and said no", () => {
    // 28P01 is an authentication failure: the connection plainly worked.
    expect(
      isConnectionFailure(
        Object.assign(new Error("password authentication failed"), {
          code: "28P01",
        }),
      ),
    ).toBe(false);
    expect(isConnectionFailure(new Error("syntax error at or near"))).toBe(
      false,
    );
    expect(isConnectionFailure(undefined)).toBe(false);
    expect(isConnectionFailure("a string")).toBe(false);
  });
});

describe("diagnoseConnection", () => {
  it("returns nothing for a connection string with no host to probe", async () => {
    // Nothing to resolve: a socket URL, or not a URL at all. No network here.
    expect(await diagnoseConnection("postgresql:///careerradar")).toBeNull();
    expect(await diagnoseConnection("not a url")).toBeNull();
    expect(await diagnoseConnection("")).toBeNull();
  });
});

describe("formatDiagnosis", () => {
  const base: ConnectionDiagnosis = {
    host: "ep-cool-bird-12345.ap-southeast-1.aws.neon.tech",
    port: 5432,
    addresses: [],
  };

  it("names the target and every address, with its family", () => {
    const out = formatDiagnosis({
      ...base,
      addresses: [
        { address: "13.228.46.236", family: 4, connectedInMs: 98 },
        {
          address: "2406:da18:94d:821b::1",
          family: 6,
          connectedInMs: null,
          failure: "ENETUNREACH",
        },
      ],
    });

    expect(out).toContain(
      "ep-cool-bird-12345.ap-southeast-1.aws.neon.tech:5432",
    );
    expect(out).toContain("IPv4  13.228.46.236  reachable in 98ms");
    expect(out).toContain(
      "IPv6  2406:da18:94d:821b::1  UNREACHABLE — ENETUNREACH",
    );
  });

  it("calls out the mixed case, which is the one where psql works and Node hangs", () => {
    const out = formatDiagnosis({
      ...base,
      addresses: [
        { address: "13.228.46.236", family: 4, connectedInMs: 98 },
        {
          address: "2406:da18:94d:821b::1",
          family: 6,
          connectedInMs: null,
          failure: "no answer in 3000ms",
        },
      ],
    });
    expect(out).toContain("1 of 2 addresses did not answer, and 1 did");
    expect(out).toContain("psql succeeds and Node hangs");
  });

  it("says the database is simply unreachable when nothing answers", () => {
    const out = formatDiagnosis({
      ...base,
      addresses: [
        {
          address: "13.228.46.236",
          family: 4,
          connectedInMs: null,
          failure: "no answer in 3000ms",
        },
      ],
    });
    expect(out).toContain("No address answered");
    expect(out).not.toContain("psql succeeds");
  });

  it("points past the network when every address answered", () => {
    const out = formatDiagnosis({
      ...base,
      addresses: [{ address: "13.228.46.236", family: 4, connectedInMs: 98 }],
    });
    expect(out).toContain("the failure was after the connection");
  });

  it("reports a name that does not resolve as exactly that", () => {
    const out = formatDiagnosis({ ...base, lookupError: "ENOTFOUND" });
    expect(out).toContain("Resolution        FAILED (ENOTFOUND)");
    expect(out).toContain("typo");
    // No address list to print, so no probe summary should be invented.
    expect(out).not.toContain("Addresses");
  });
});
