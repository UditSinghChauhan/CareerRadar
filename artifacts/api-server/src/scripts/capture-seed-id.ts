/** The demo account the landing captures are taken from. Invented. */
export const CAPTURE_CLERK_ID = "user_capture_demo";

/**
 * How many days before the capture each seeded posting is dated: spread over
 * the last week (0 to 7 days), so no ranked pick in the photographed queue
 * is stale.
 */
export const postedDaysAgo = (n: number) => (n * 5) % 8;
