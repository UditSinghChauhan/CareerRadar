import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import cors from "cors";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { corsOrigin, parseAllowedOrigins } from "./allowed-origins";

describe("parseAllowedOrigins", () => {
  it("is null when unset or blank, so the API keeps reflecting any origin", () => {
    expect(parseAllowedOrigins(undefined)).toBeNull();
    expect(parseAllowedOrigins("")).toBeNull();
    expect(parseAllowedOrigins("  , ")).toBeNull();
  });

  it("reads a comma-separated list as bare origins", () => {
    expect(
      parseAllowedOrigins(
        " https://careerradar.vercel.app/ ,https://careerradar-34ec.onrender.com",
      ),
    ).toEqual([
      "https://careerradar.vercel.app",
      "https://careerradar-34ec.onrender.com",
    ]);
  });

  it("drops entries that are not an http(s) origin rather than widen the list", () => {
    expect(
      parseAllowedOrigins(
        "careerradar.app, https://ok.example/path, ftp://x.example, *, https://ok.example",
      ),
    ).toEqual(["https://ok.example"]);
  });
});

describe("CORS with ALLOWED_ORIGINS", () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  async function serve(raw: string | undefined) {
    const app = express();
    app.use(
      cors({ credentials: true, origin: corsOrigin(parseAllowedOrigins(raw)) }),
    );
    app.get("/api/x", (_req, res) => res.json({ ok: true }));
    server = app.listen(0);
    await new Promise((r) => server!.once("listening", r));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  it("answers a listed origin with credentials allowed", async () => {
    const base = await serve("https://careerradar.vercel.app");
    const res = await fetch(`${base}/api/x`, {
      headers: { Origin: "https://careerradar.vercel.app" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://careerradar.vercel.app",
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("gives an unlisted origin no CORS headers", async () => {
    const base = await serve("https://careerradar.vercel.app");
    const res = await fetch(`${base}/api/x`, {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("still reflects any origin while the variable is unset", async () => {
    const base = await serve(undefined);
    const res = await fetch(`${base}/api/x`, {
      headers: { Origin: "https://anything.example" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://anything.example",
    );
  });
});
