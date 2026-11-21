import { describe, expect, it } from "vitest";
import { titleFor } from "../page-title";

describe("titleFor", () => {
  it("names the product and its promise on the home page", () => {
    expect(titleFor("/")).toBe(
      "CareerRadar · Ten SDE roles worth applying to, every morning",
    );
  });

  it("names the page first inside the app", () => {
    expect(titleFor("/jobs")).toBe("Jobs · CareerRadar");
    expect(titleFor("/tools/capture")).toBe("Capture · CareerRadar");
    expect(titleFor("/sign-in/factor-one")).toBe("Sign in · CareerRadar");
  });

  it("says when a page does not exist", () => {
    expect(titleFor("/nope")).toBe("Page not found · CareerRadar");
  });
});
