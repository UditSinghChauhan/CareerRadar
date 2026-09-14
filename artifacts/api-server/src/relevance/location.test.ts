import { describe, expect, it } from "vitest";
import {
  bucketOf,
  DEFAULT_LOCATION_BUCKETS,
  FEATURED_METROS,
  normalizeLocation,
  toLocationColumns,
} from "./location";

/**
 * Every string in the first block is a real value from the live jobs table
 * (UPGRADE.md §2.0). The later blocks are formats sampled from the provider
 * APIs on 2026-09-14 — Adzuna is the largest source and its second token is
 * often a district, which the spec's original list did not show.
 */

describe("normalizeLocation — values named in the spec", () => {
  it.each(["Mumbai, MH", "Mumbai, Maharashtra", "Mumbai Metropolitan Region"])(
    "%s → Mumbai / Maharashtra / MMR",
    (raw) => {
      expect(normalizeLocation(raw)).toEqual({
        city: "Mumbai",
        region: "Maharashtra",
        country: "IN",
        metro: "MMR",
        isIndia: true,
        isRemote: false,
      });
    },
  );

  it("Navi Mumbai, MH → its own city, still MMR", () => {
    expect(normalizeLocation("Navi Mumbai, MH")).toMatchObject({
      city: "Navi Mumbai",
      region: "Maharashtra",
      metro: "MMR",
      isIndia: true,
    });
  });

  it.each(["New Delhi, DL", "New Delhi, Delhi"])("%s → NCR", (raw) => {
    expect(normalizeLocation(raw)).toEqual({
      city: "New Delhi",
      region: "Delhi",
      country: "IN",
      metro: "NCR",
      isIndia: true,
      isRemote: false,
    });
  });

  it("Bengaluru, Karnataka", () => {
    expect(normalizeLocation("Bengaluru, Karnataka")).toEqual({
      city: "Bengaluru",
      region: "Karnataka",
      country: "IN",
      metro: "Bengaluru",
      isIndia: true,
      isRemote: false,
    });
  });

  it("Gurugram, Haryana → NCR", () => {
    expect(normalizeLocation("Gurugram, Haryana")).toMatchObject({
      city: "Gurugram",
      region: "Haryana",
      metro: "NCR",
      isIndia: true,
    });
  });

  it("Noida, Uttar Pradesh → NCR", () => {
    expect(normalizeLocation("Noida, Uttar Pradesh")).toMatchObject({
      city: "Noida",
      region: "Uttar Pradesh",
      metro: "NCR",
      isIndia: true,
    });
  });

  it.each(["IN", "India", "in"])(
    "bare country token %s → IN, no city (rule 5)",
    (raw) => {
      expect(normalizeLocation(raw)).toEqual({
        city: undefined,
        region: undefined,
        country: "IN",
        metro: undefined,
        isIndia: true,
        isRemote: false,
      });
    },
  );

  it("TG → Telangana, India, no city", () => {
    expect(normalizeLocation("TG")).toEqual({
      city: undefined,
      region: "Telangana",
      country: "IN",
      metro: undefined,
      isIndia: true,
      isRemote: false,
    });
  });

  it("Worldwide → remote, isIndia null (rule 1: remote alone decides nothing)", () => {
    expect(normalizeLocation("Worldwide")).toEqual({
      city: undefined,
      region: undefined,
      country: undefined,
      metro: undefined,
      isIndia: null,
      isRemote: true,
    });
  });

  it("'Nassau, ' (trailing comma) → Bahamas, isIndia false", () => {
    expect(normalizeLocation("Nassau, ")).toMatchObject({
      city: "Nassau",
      country: "BS",
      isIndia: false,
      isRemote: false,
    });
  });

  it("'Toronto, ' → Canada, isIndia false", () => {
    expect(normalizeLocation("Toronto, ")).toMatchObject({
      city: "Toronto",
      region: "Ontario",
      country: "CA",
      isIndia: false,
    });
  });

  it("unrecognised string → isIndia null, NEVER false (rule 6)", () => {
    for (const raw of [
      "LSNYC Central Office",
      "Black Bess, ",
      "Posts, ",
      "Greater Newcastle Area, ",
      "Uluberia-II, ",
      "مسقط, مسقط مسقط عمان",
      "Head Office",
    ]) {
      const n = normalizeLocation(raw);
      expect(n.isIndia, raw).toBeNull();
      expect(n.isIndia, raw).not.toBe(false);
      expect(n.city, raw).toBeUndefined();
      expect(n.country, raw).toBeUndefined();
    }
  });

  it("empty / null / whitespace → all unknown", () => {
    for (const raw of ["", "   ", null, undefined]) {
      expect(normalizeLocation(raw)).toEqual({
        city: undefined,
        region: undefined,
        country: undefined,
        metro: undefined,
        isIndia: null,
        isRemote: false,
      });
    }
  });
});

describe("normalizeLocation — rule 2 state abbreviations and rule 3 aliases", () => {
  it.each([
    ["Bangalore, KA", "Bengaluru", "Karnataka"],
    ["Gurgaon, HR", "Gurugram", "Haryana"],
    ["Bombay, MH", "Mumbai", "Maharashtra"],
    ["Calcutta, WB", "Kolkata", "West Bengal"],
    ["Madras, TN", "Chennai", "Tamil Nadu"],
    ["Trivandrum, KL", "Thiruvananthapuram", "Kerala"],
    ["Hyderabad, TS", "Hyderabad", "Telangana"],
    ["Jaipur, RJ", "Jaipur", "Rajasthan"],
    ["Indore, MP", "Indore", "Madhya Pradesh"],
    ["Ahmedabad, GJ", "Ahmedabad", "Gujarat"],
    ["Mohali, PB", "Mohali", "Punjab"],
    ["Visakhapatnam, AP", "Visakhapatnam", "Andhra Pradesh"],
    ["Lucknow, UP", "Lucknow", "Uttar Pradesh"],
    ["Delhi, DL", "Delhi", "Delhi"],
  ])("%s → %s / %s", (raw, city, region) => {
    expect(normalizeLocation(raw)).toMatchObject({
      city,
      region,
      country: "IN",
      isIndia: true,
    });
  });

  it("TN is Tamil Nadu unless the string is already American", () => {
    expect(normalizeLocation("Coimbatore, TN")).toMatchObject({
      region: "Tamil Nadu",
      isIndia: true,
    });
    expect(normalizeLocation("Nashville, TN")).toMatchObject({
      region: "Tennessee",
      country: "US",
      isIndia: false,
    });
  });

  it("IN is Indiana once the US is established", () => {
    expect(normalizeLocation("Indianapolis, IN, United States")).toMatchObject({
      country: "US",
      isIndia: false,
    });
  });
});

describe("normalizeLocation — rule 4 metro grouping", () => {
  it.each([
    "Delhi",
    "New Delhi",
    "Noida",
    "Greater Noida",
    "Gurugram",
    "Gurgaon",
    "Faridabad",
    "Ghaziabad",
    "Delhi NCR",
    "Delhi/NCR",
  ])("%s → NCR", (raw) => {
    expect(normalizeLocation(raw).metro).toBe("NCR");
  });

  it.each(["Mumbai", "Navi Mumbai", "Thane", "Mumbai Metropolitan Region"])(
    "%s → MMR",
    (raw) => {
      expect(normalizeLocation(raw).metro).toBe("MMR");
    },
  );

  it.each([
    ["Hyderabad", "Hyderabad"],
    ["Secunderabad", "Hyderabad"],
    ["Pune", "Pune"],
    ["Chennai", "Chennai"],
    ["Kolkata", "Kolkata"],
    ["Ahmedabad", "Ahmedabad"],
    ["Jaipur", "Jaipur"],
  ])("%s → metro is its own city (%s)", (raw, metro) => {
    expect(normalizeLocation(raw).metro).toBe(metro);
  });
});

describe("normalizeLocation — Adzuna formats (largest live source)", () => {
  it("'India' bare is 31% of Adzuna results → India, no city, no metro", () => {
    expect(normalizeLocation("India")).toMatchObject({
      isIndia: true,
      country: "IN",
      metro: undefined,
    });
  });

  it("Bangalore, Karnataka (alias + full state)", () => {
    expect(normalizeLocation("Bangalore, Karnataka")).toMatchObject({
      city: "Bengaluru",
      metro: "Bengaluru",
      isIndia: true,
    });
  });

  it("second token is a district, not a state: Noida, Ghaziabad → NCR", () => {
    expect(normalizeLocation("Noida, Ghaziabad")).toMatchObject({
      city: "Noida",
      region: "Uttar Pradesh",
      metro: "NCR",
      isIndia: true,
    });
  });

  it("Palwal, Faridabad → NCR (Palwal district is NCR)", () => {
    expect(normalizeLocation("Palwal, Faridabad")).toMatchObject({
      city: "Palwal",
      region: "Haryana",
      metro: "NCR",
      isIndia: true,
    });
  });

  it("Kochi, Ernakulam → Kerala", () => {
    expect(normalizeLocation("Kochi, Ernakulam")).toMatchObject({
      city: "Kochi",
      region: "Kerala",
      metro: "Kochi",
      isIndia: true,
    });
  });

  it("unknown town + known district: Devanahalli, Bangalore Rural → Bengaluru metro", () => {
    expect(normalizeLocation("Devanahalli, Bangalore Rural")).toEqual({
      city: "Devanahalli",
      region: "Karnataka",
      country: "IN",
      metro: "Bengaluru",
      isIndia: true,
      isRemote: false,
    });
  });

  it("unknown town + known state: Durg, Chhattisgarh keeps the town as city", () => {
    expect(normalizeLocation("Bhilai Nagar, Chhattisgarh")).toMatchObject({
      city: "Bhilai Nagar",
      region: "Chhattisgarh",
      metro: "Bhilai Nagar",
      isIndia: true,
    });
  });

  it("Delhi, India", () => {
    expect(normalizeLocation("Delhi, India")).toMatchObject({
      city: "Delhi",
      metro: "NCR",
      isIndia: true,
    });
  });

  it.each([
    ["Chennai, Tamil Nadu", "Chennai"],
    ["Hyderabad, Telangana", "Hyderabad"],
    ["Ahmedabad, Gujarat", "Ahmedabad"],
    ["Vadodara, Gujarat", "Vadodara"],
    ["Dehradun, Uttarakhand", "Dehradun"],
    ["Coimbatore, Tamil Nadu", "Coimbatore"],
    ["Navi Mumbai, Maharashtra", "MMR"],
    ["Nashik, Maharashtra", "Nashik"],
    ["Surat, Gujarat", "Surat"],
    ["Kolkata, West Bengal", "Kolkata"],
    ["Nagpur, Maharashtra", "Nagpur"],
    ["Lucknow, Uttar Pradesh", "Lucknow"],
  ])("%s → India, metro %s", (raw, metro) => {
    expect(normalizeLocation(raw)).toMatchObject({ isIndia: true, metro });
  });
});

describe("normalizeLocation — RemoteOK / Remotive / Jobicy formats", () => {
  it("'Remote' alone → remote, unknown country", () => {
    expect(normalizeLocation("Remote")).toMatchObject({
      isRemote: true,
      isIndia: null,
    });
  });

  it("'Anywhere' and 'Work From Home' are remote markers", () => {
    expect(normalizeLocation("Anywhere").isRemote).toBe(true);
    expect(normalizeLocation("Work From Home").isRemote).toBe(true);
    expect(normalizeLocation("WFH - Bengaluru")).toMatchObject({
      isRemote: true,
      metro: "Bengaluru",
      isIndia: true,
    });
  });

  it("'Remote - India' → remote AND India", () => {
    expect(normalizeLocation("Remote - India")).toMatchObject({
      isRemote: true,
      isIndia: true,
      country: "IN",
    });
  });

  it("remote scoped to another country → remote, isIndia false", () => {
    expect(normalizeLocation("Remote - US")).toMatchObject({
      isRemote: true,
      country: "US",
      isIndia: false,
    });
    expect(normalizeLocation("Remote UK")).toMatchObject({
      isRemote: true,
      country: "GB",
      isIndia: false,
    });
  });

  it("four-level RemoteOK string: Austin, Austin, Texas, United States", () => {
    expect(normalizeLocation("Austin, Austin, Texas, United States")).toEqual({
      city: "Austin",
      region: "Texas",
      country: "US",
      metro: "Austin",
      isIndia: false,
      isRemote: false,
    });
  });

  it("California, California, United States", () => {
    expect(
      normalizeLocation("California, California, United States"),
    ).toMatchObject({ region: "California", country: "US", isIndia: false });
  });

  it("Orem, UT → US state code with no Indian reading", () => {
    expect(normalizeLocation("Orem, UT")).toMatchObject({
      region: "Utah",
      country: "US",
      isIndia: false,
    });
  });

  it("Vancouver, BC, Canada", () => {
    expect(normalizeLocation("Vancouver, BC, Canada")).toMatchObject({
      city: "Vancouver",
      region: "British Columbia",
      country: "CA",
      isIndia: false,
    });
  });

  it("'Dehradun, ' → India even with the trailing comma", () => {
    expect(normalizeLocation("Dehradun, ")).toMatchObject({
      city: "Dehradun",
      region: "Uttarakhand",
      isIndia: true,
    });
  });

  it("multi-country Remotive scope names no single country", () => {
    const n = normalizeLocation(
      "Europe, USA, UK, Canada, Australia, Singapore",
    );
    expect(n.country).toBeUndefined();
    expect(n.isIndia).toBe(false);
  });

  it("a scope that includes APAC is not scoped away from India", () => {
    expect(
      normalizeLocation("LATAM, Europe, USA, Canada, APAC").isIndia,
    ).toBeNull();
  });

  it("'Europe' alone → false; 'Americas, Europe, Israel' → false", () => {
    expect(normalizeLocation("Europe").isIndia).toBe(false);
    expect(normalizeLocation("Americas, Europe, Israel").isIndia).toBe(false);
  });

  it("Bangalore, Karnataka, India (three levels)", () => {
    expect(normalizeLocation("Bangalore, Karnataka, India")).toMatchObject({
      city: "Bengaluru",
      metro: "Bengaluru",
      isIndia: true,
    });
  });
});

describe("normalizeLocation — Lever multi-location strings", () => {
  it("first city wins; the row is still India", () => {
    expect(normalizeLocation("Bengaluru, Pune")).toMatchObject({
      city: "Bengaluru",
      metro: "Bengaluru",
      isIndia: true,
    });
  });

  it("parenthesised mode: 'Bengaluru (Hybrid)'", () => {
    expect(normalizeLocation("Bengaluru (Hybrid)")).toMatchObject({
      city: "Bengaluru",
      isIndia: true,
      isRemote: false,
    });
  });
});

describe("normalizeLocation — provider country hint", () => {
  it("fills the gap when the string says nothing ('Remote' + JSearch job_country IN)", () => {
    expect(normalizeLocation("Remote", "India")).toMatchObject({
      isRemote: true,
      country: "IN",
      isIndia: true,
    });
    expect(normalizeLocation("", "IN")).toMatchObject({
      country: "IN",
      isIndia: true,
    });
  });

  it("accepts SmartRecruiters' lowercase ISO-2", () => {
    expect(normalizeLocation("", "in")).toMatchObject({ isIndia: true });
    expect(normalizeLocation("", "ca")).toMatchObject({
      country: "CA",
      isIndia: false,
    });
  });

  it("never overrides what the string itself says", () => {
    expect(normalizeLocation("Toronto, ", "in")).toMatchObject({
      country: "CA",
      isIndia: false,
    });
    expect(normalizeLocation("Bengaluru", "us")).toMatchObject({
      country: "IN",
      isIndia: true,
    });
  });

  it("an unknown string with no hint stays null", () => {
    expect(normalizeLocation("Somewhere Nice", undefined).isIndia).toBeNull();
  });
});

describe("determinism — the property the recompute-all backfill relies on", () => {
  it("same input, same output, every time", () => {
    for (const raw of [
      "Mumbai, MH",
      "Worldwide",
      "Posts, ",
      "Noida, Ghaziabad",
    ]) {
      expect(normalizeLocation(raw)).toEqual(normalizeLocation(raw));
    }
  });
});

describe("toLocationColumns / bucketOf", () => {
  it("maps undefined to null so the columns are written, not skipped", () => {
    expect(toLocationColumns(normalizeLocation("Posts, "))).toEqual({
      locationCity: null,
      locationRegion: null,
      locationCountry: null,
      locationMetro: null,
      isIndia: null,
      isRemote: false,
    });
  });

  it("buckets are exclusive and cover every row", () => {
    expect(bucketOf(normalizeLocation("Noida, UP"))).toBe("NCR");
    expect(bucketOf(normalizeLocation("Thane"))).toBe("MMR");
    expect(bucketOf(normalizeLocation("Bengaluru"))).toBe("Bengaluru");
    expect(bucketOf(normalizeLocation("Jaipur"))).toBe("other_india");
    expect(bucketOf(normalizeLocation("India"))).toBe("other_india");
    expect(bucketOf(normalizeLocation("Worldwide"))).toBe("remote");
    expect(bucketOf(normalizeLocation("Posts, "))).toBe("unknown");
    expect(bucketOf(normalizeLocation("Toronto, "))).toBe("abroad");
    // Remote-elsewhere is elsewhere, not remote.
    expect(bucketOf(normalizeLocation("Remote - US"))).toBe("abroad");
    // Remote-in-India counts under its metro; the SQL remote bucket also matches it.
    expect(bucketOf(normalizeLocation("Remote - Bengaluru"))).toBe("Bengaluru");
  });

  it("buckets the column shape (what the backfill and DB rows carry) identically", () => {
    for (const raw of [
      "Bengaluru",
      "Gurugram",
      "Thane",
      "Jaipur",
      "Posts, ",
      "Toronto, ",
      "Worldwide",
    ]) {
      const n = normalizeLocation(raw);
      expect(bucketOf(toLocationColumns(n)), raw).toBe(bucketOf(n));
    }
  });

  it("the default buckets are all valid bucket keys", () => {
    for (const b of DEFAULT_LOCATION_BUCKETS) {
      expect(
        (FEATURED_METROS as readonly string[]).includes(b) || b === "remote",
      ).toBe(true);
    }
  });
});
