import { clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

/**
 * The email the suite signs in as. The `+clerk_test` suffix is Clerk's reserved
 * test-address convention: on a development instance these addresses never
 * receive real mail and skip deliverability checks, so the account is inert.
 */
export const E2E_EMAIL =
  process.env.E2E_CLERK_USER_EMAIL ?? "careerradar-e2e+clerk_test@example.com";

async function ensureTestUser(): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "CLERK_SECRET_KEY is not set. The e2e suite signs in through Clerk's " +
        "backend API and cannot run without it. Add it to the root .env.",
    );
  }
  if (!secretKey.startsWith("sk_test_")) {
    // Hard stop rather than a warning: this suite creates users and writes
    // application rows. Pointed at a production instance that is real damage.
    throw new Error(
      "Refusing to run: CLERK_SECRET_KEY is not a development (sk_test_) key. " +
        "The e2e suite creates a user and writes data, so it only runs against " +
        "a Clerk development instance.",
    );
  }

  const clerk = createClerkClient({ secretKey });
  const { data: existing } = await clerk.users.getUserList({
    emailAddress: [E2E_EMAIL],
  });

  if (existing.length > 0) {
    console.log(`[e2e] using existing Clerk test user ${E2E_EMAIL}`);
    return;
  }

  if (process.env.E2E_CLERK_CREATE_USER === "false") {
    throw new Error(
      `No Clerk user for ${E2E_EMAIL} and E2E_CLERK_CREATE_USER=false. ` +
        "Create the user manually or unset that variable.",
    );
  }

  console.log(
    `[e2e] creating Clerk test user ${E2E_EMAIL} on your development instance ` +
      "(one-off; set E2E_CLERK_CREATE_USER=false to disable)",
  );
  await clerk.users.createUser({
    emailAddress: [E2E_EMAIL],
    skipPasswordRequirement: true,
    // Labels the account in the Clerk dashboard so it is obviously machinery.
    publicMetadata: { createdBy: "careerradar-e2e" },
  });
}

export default async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const host = dbUrl.match(/@([^/:]+)/)?.[1];
  if (host && !["localhost", "127.0.0.1", "::1"].includes(host)) {
    // CLAUDE.md: the deployed database has live data. These specs create and
    // mutate application rows, so a non-local DATABASE_URL is never acceptable.
    throw new Error(
      `Refusing to run: DATABASE_URL points at "${host}", not localhost. ` +
        "The e2e suite writes application rows and must only touch a local database.",
    );
  }

  await ensureTestUser();
  // Fetches the Clerk Testing Token that lets the suite bypass bot protection.
  await clerkSetup();
}
