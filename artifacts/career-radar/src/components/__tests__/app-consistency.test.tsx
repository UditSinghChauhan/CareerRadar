import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

describe("one product, landing to app", () => {
  it("makes the primary button the ink pill, never green", () => {
    const cls = buttonVariants();
    expect(cls).toContain("bg-action");
    expect(cls).toContain("rounded-full");
    expect(cls).toContain("active:scale-[0.98]");
    expect(cls).not.toMatch(/\bbg-primary\b/);
  });

  it("keeps a visible keyboard focus ring on every button", () => {
    render(<Button>Apply</Button>);
    expect(screen.getByRole("button", { name: "Apply" }).className).toMatch(
      /focus-visible:ring-2/,
    );
  });

  it("gives every page the same header", () => {
    render(<PageHeader title="Jobs" description="Every open role." />);
    const h1 = screen.getByRole("heading", { level: 1, name: "Jobs" });
    expect(h1.className).toContain("text-[28px]");
    expect(h1.className).toContain("font-medium");
  });
});
