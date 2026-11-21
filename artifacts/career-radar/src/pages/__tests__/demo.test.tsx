import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

const h = vi.hoisted(() => ({
  createDemoSession: vi.fn(),
  signInCreate: vi.fn(),
  setActive: vi.fn(),
  auth: { isLoaded: true, isSignedIn: false },
}));

vi.mock("@workspace/api-client-react", () => ({
  createDemoSession: h.createDemoSession,
}));
vi.mock("@clerk/react", () => ({
  useAuth: () => h.auth,
  useClerk: () => ({
    client: { signIn: { create: h.signInCreate } },
    setActive: h.setActive,
  }),
}));

import { DemoPage } from "../demo";
import { isDemoReadOnly } from "@/lib/demo";

function renderAt() {
  const loc = memoryLocation({ path: "/demo", record: true });
  render(
    <Router hook={loc.hook}>
      <DemoPage />
    </Router>,
  );
  return loc;
}

beforeEach(() => {
  h.auth = { isLoaded: true, isSignedIn: false };
  h.createDemoSession.mockReset().mockResolvedValue({ ticket: "tkt_1" });
  h.signInCreate
    .mockReset()
    .mockResolvedValue({ status: "complete", createdSessionId: "sess_1" });
  h.setActive.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("/demo", () => {
  it("redeems the server's ticket and opens the dashboard", async () => {
    const loc = renderAt();
    expect(screen.getByText("Opening the demo")).toBeInTheDocument();
    await waitFor(() => expect(loc.history.at(-1)).toBe("/dashboard"));
    expect(h.signInCreate).toHaveBeenCalledWith({
      strategy: "ticket",
      ticket: "tkt_1",
    });
    expect(h.setActive).toHaveBeenCalledWith({ session: "sess_1" });
  });

  it("says so, and offers sign-up, when the demo cannot open", async () => {
    h.createDemoSession.mockRejectedValue(new Error("404"));
    renderAt();
    expect(
      await screen.findByText("The demo isn’t available right now"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
  });

  it("sends someone already signed in straight to the dashboard", async () => {
    h.auth = { isLoaded: true, isSignedIn: true };
    const loc = renderAt();
    await waitFor(() => expect(loc.history.at(-1)).toBe("/dashboard"));
    expect(h.createDemoSession).not.toHaveBeenCalled();
  });
});

describe("isDemoReadOnly", () => {
  it("recognises the server's refusal and nothing else", () => {
    const refusal = { status: 403, data: { error: "demo_read_only" } };
    expect(isDemoReadOnly(refusal)).toBe(true);
    expect(isDemoReadOnly({ status: 403, data: { error: "Forbidden" } })).toBe(
      false,
    );
    expect(isDemoReadOnly(new Error("network"))).toBe(false);
    expect(isDemoReadOnly(null)).toBe(false);
  });
});
