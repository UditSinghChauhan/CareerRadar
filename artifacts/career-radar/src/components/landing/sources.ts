/** Where postings come from, how often each source syncs, and when a posting closes. */
export const SOURCES = [
  {
    names: "Greenhouse, Lever, Ashby, SmartRecruiters, Workday",
    from: "The employer’s own careers page",
    synced: "Every six hours",
    closes: "When it leaves the employer’s listing",
  },
  {
    names: "RemoteOK, Remotive, Jobicy",
    from: "Job boards with free APIs",
    synced: "Every six hours",
    closes: "At 45 days old, or past its deadline",
  },
  {
    names: "Adzuna",
    from: "Job board, 250 requests a day",
    synced: "Every six hours",
    closes: "At 45 days old, or past its deadline",
  },
  {
    names: "JSearch",
    from: "Job board, 200 requests a month",
    synced: "Once a day",
    closes: "At 45 days old, or past its deadline",
  },
] as const;

/** Every source by name, in the order above: the landing's list of wordmarks. */
export const SOURCE_NAMES: string[] = SOURCES.flatMap((s) =>
  s.names.split(", "),
);
