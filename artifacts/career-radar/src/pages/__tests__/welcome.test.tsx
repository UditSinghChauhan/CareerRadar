import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import {
  getGetProfileQueryKey,
  type Profile,
} from "@workspace/api-client-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { togglePlace } from "@/components/onboarding/preferences-form";
import { WelcomePage } from "../welcome";
import { DashboardPage } from "../dashboard";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isLoaded: true, user: { firstName: "New" } }),
}));

const newProfile = {
  id: "p1",
  clerkId: "user_new",
  name: "New Student",
  email: "new@example.test",
  skills: [],
  rolePreference: null,
  preferredLocations: [],
  createdAt: "2026-11-03T03:30:00.000Z",
} as unknown as Profile;

function setup(ui: React.ReactNode, path: string, profile = newProfile) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(getGetProfileQueryKey(), profile);
  const loc = memoryLocation({ path, record: true });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Router hook={loc.hook}>{ui}</Router>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { loc };
}

afterEach(() => vi.unstubAllGlobals());

describe("togglePlace", () => {
  it("keeps Anywhere in India on its own", () => {
    expect(togglePlace(["Pune", "remote"], "anywhere")).toEqual(["anywhere"]);
    expect(togglePlace(["anywhere"], "Pune")).toEqual(["Pune"]);
    expect(togglePlace(["Pune"], "Pune")).toEqual(["anywhere"]);
    expect(togglePlace(["Pune"], "remote")).toEqual(["Pune", "remote"]);
  });
});

describe("onboarding, /welcome", () => {
  it("asks one question with complete defaults", () => {
    setup(<WelcomePage />, "/welcome");
    expect(
      screen.getByRole("heading", { name: "Two choices, then your ten." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Both" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Anywhere in India" }),
    ).toHaveAttribute("aria-pressed", "true");
    // No profile form: no text inputs at all.
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("saves the answer and goes straight to Today's ten", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({ ...newProfile, ...body }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { loc } = setup(<WelcomePage />, "/welcome");

    await user.click(screen.getByRole("radio", { name: "Internships" }));
    await user.click(screen.getByRole("button", { name: "Pune" }));
    await user.click(screen.getByRole("button", { name: "Remote" }));
    await user.click(screen.getByRole("button", { name: "Show my ten" }));

    await waitFor(() => expect(loc.history.at(-1)).toBe("/dashboard"));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/api/profile");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      rolePreference: "internship",
      preferredLocations: ["Pune", "remote"],
    });
  });

  it("says what went wrong and stays put when saving fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const user = userEvent.setup();
    const { loc } = setup(<WelcomePage />, "/welcome");
    await user.click(screen.getByRole("button", { name: "Show my ten" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save your choices",
    );
    expect(loc.history.at(-1)).toBe("/welcome");
    // The button is ready for a retry.
    expect(screen.getByRole("button", { name: "Show my ten" })).toBeEnabled();
  });
});

describe("the dashboard sends an account that has not answered to /welcome", () => {
  it("redirects", async () => {
    // Nothing else on the dashboard needs to load for the redirect.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { loc } = setup(<DashboardPage />, "/dashboard");
    await waitFor(() => expect(loc.history.at(-1)).toBe("/welcome"));
  });

  it("does not redirect once answered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { loc } = setup(<DashboardPage />, "/dashboard", {
      ...newProfile,
      rolePreference: "both",
    } as Profile);
    await screen.findByTestId("todays-queue");
    expect(loc.history.at(-1)).toBe("/dashboard");
  });
});
