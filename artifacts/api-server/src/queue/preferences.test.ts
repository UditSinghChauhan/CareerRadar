import { describe, expect, it } from "vitest";
import { preferenceMatchSql, preferenceMiss } from "./preferences";

const job = (over: Partial<Parameters<typeof preferenceMiss>[0]> = {}) => ({
  jobType: "internship" as const,
  locationMetro: "Pune",
  locationCity: "Pune",
  isRemote: false,
  ...over,
});

describe("preferenceMiss", () => {
  it("says nothing without a preference", () => {
    expect(preferenceMiss(job(), null)).toBeNull();
    expect(
      preferenceMiss(job(), { rolePreference: "both", preferredLocations: [] }),
    ).toBeNull();
    expect(
      preferenceMiss(job({ locationMetro: "Chennai" }), {
        rolePreference: "both",
        preferredLocations: ["anywhere", "Pune"],
      }),
    ).toBeNull();
  });

  it("names the role type that does not match", () => {
    expect(
      preferenceMiss(job({ jobType: "full_time" }), {
        rolePreference: "internship",
        preferredLocations: [],
      }),
    ).toBe("Full-time, not an internship");
    expect(
      preferenceMiss(job(), {
        rolePreference: "new_grad",
        preferredLocations: [],
      }),
    ).toBe("An internship, not a new grad role");
  });

  it("names the city that does not match, with metros as people say them", () => {
    const prefs = {
      rolePreference: "both" as const,
      preferredLocations: ["Pune"],
    };
    expect(
      preferenceMiss(
        job({ locationMetro: "NCR", locationCity: "Noida" }),
        prefs,
      ),
    ).toBe("In Delhi NCR, outside your cities");
    expect(
      preferenceMiss(
        job({ locationMetro: "Chennai", locationCity: "Chennai" }),
        prefs,
      ),
    ).toBe("In Chennai, outside your cities");
    expect(
      preferenceMiss(
        job({ locationMetro: null, locationCity: null, isRemote: true }),
        prefs,
      ),
    ).toBe("Remote, outside your cities");
  });

  it("accepts a remote role when Remote is chosen", () => {
    expect(
      preferenceMiss(job({ locationMetro: null, isRemote: true }), {
        rolePreference: "internship",
        preferredLocations: ["remote"],
      }),
    ).toBeNull();
  });
});

describe("preferenceMatchSql", () => {
  it("leaves the order alone when there is nothing to prefer", () => {
    expect(preferenceMatchSql(null)).toBeNull();
    expect(
      preferenceMatchSql({
        rolePreference: "both",
        preferredLocations: ["anywhere"],
      }),
    ).toBeNull();
    expect(
      preferenceMatchSql({
        rolePreference: "internship",
        preferredLocations: [],
      }),
    ).not.toBeNull();
  });
});
