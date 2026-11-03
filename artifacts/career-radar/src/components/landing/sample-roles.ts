/**
 * The sample roles on the landing page. Every company and title here is
 * invented, and the page labels them "Sample roles". The ten ranked ones are
 * the rows of illustrative-queue.json, whose scores and reasons come from the
 * API's own scoring code (api-server's illustrative-queue.test.ts fails if
 * they drift). The rest only fill the hero's field.
 */
import illustrative from "./illustrative-queue.json";

export type Tint = "sky" | "sage" | "sand" | "rose" | "stone" | "teal";

export type SampleRole = {
  id: string;
  company: string;
  title: string;
  city: string;
  /** A short line of card meta: track and work mode. */
  meta: string;
  tint: Tint;
  /** 1 to 10 for the ten of the day, otherwise 0. */
  rank: number;
  /** Whole-number score, for the ranked ten. */
  score: number;
  reasons: string[];
  components: {
    relevanceScore: number;
    deadlineUrgency: number;
    freshness: number;
    dreamCompanyBoost: number;
  };
};

const TINTS: Tint[] = ["sky", "sage", "sand", "rose", "stone", "teal"];

const TRACK: Record<string, string> = {
  new_grad: "New grad",
  internship: "Internship",
  early_career: "Early career",
};
const MODE: Record<string, string> = {
  hybrid: "Hybrid",
  onsite: "On-site",
  remote: "Remote",
};

type Row = (typeof illustrative.items)[number];

export const RANKED: SampleRole[] = illustrative.items.map((row: Row, i) => ({
  id: row.job.id,
  company: row.job.company.name,
  title: row.job.title,
  city: row.job.location,
  meta: `${TRACK[row.job.relevanceTrack] ?? ""} · ${MODE[row.job.workMode] ?? ""}`,
  tint: TINTS[i % TINTS.length],
  rank: i + 1,
  score: Math.round(row.priority),
  reasons: row.reasons,
  components: row.components,
}));

/** The field around the headline: invented roles, never ranked. */
const FIELD: Array<[string, string, string, string]> = [
  ["Copperleaf", "Junior Backend Developer", "Pune", "New grad · Hybrid"],
  ["Tidewater Labs", "Platform Engineer Intern", "Bengaluru", "Internship"],
  ["Saffron Pay", "Android Developer, Graduate", "Mumbai", "New grad"],
  ["Ninefold", "QA Automation Engineer", "Chennai", "Early career"],
  ["Lattice Works", "Cloud Support Associate", "Hyderabad", "New grad"],
  ["Bluebird Health", "Full Stack Intern", "Gurugram", "Internship"],
  ["Monsoon AI", "ML Engineer, New Grad", "Bengaluru", "New grad · Remote"],
  ["Driftwood", "iOS Engineer Intern", "Kochi", "Internship"],
  ["Granite Bank", "Graduate Technologist", "Mumbai", "New grad · On-site"],
  ["Halcyon", "DevOps Engineer I", "Noida", "Early career"],
  ["Ember Mobility", "Embedded Software Intern", "Pune", "Internship"],
  ["Northstar Edu", "Software Engineer, Trainee", "Ahmedabad", "New grad"],
  ["Quarry", "Data Analyst, Graduate", "Bengaluru", "New grad · Hybrid"],
  ["Pinecrest", "Security Engineer Intern", "Hyderabad", "Internship"],
  ["Kite Freight", "Backend Engineer, Early Career", "Chennai", "Early career"],
  ["Vellum", "Frontend Developer Intern", "Remote, India", "Internship"],
  ["Ridgeline", "SDE 1, Payments", "Gurugram", "New grad · Hybrid"],
  ["Ochre Studio", "Game Developer, Graduate", "Pune", "New grad"],
  ["Larkspur", "Site Reliability Intern", "Bengaluru", "Internship"],
  ["Basalt Systems", "Systems Engineer, New Grad", "Noida", "New grad"],
  ["Meadow", "Product Engineer I", "Mumbai", "Early career · Remote"],
  ["Indigo Rail", "Software Engineer Trainee", "Chennai", "New grad"],
  ["Cinder", "Test Engineer Intern", "Hyderabad", "Internship"],
  ["Willow Labs", "Graduate Software Engineer", "Bengaluru", "New grad"],
];

export const FIELD_ROLES: SampleRole[] = FIELD.map(
  ([company, title, city, meta], i) => ({
    id: `field-${i}`,
    company,
    title,
    city,
    meta,
    tint: TINTS[(i + 3) % TINTS.length],
    rank: 0,
    score: 0,
    reasons: [],
    components: {
      relevanceScore: 0,
      deadlineUrgency: 0,
      freshness: 0,
      dreamCompanyBoost: 0,
    },
  }),
);

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
