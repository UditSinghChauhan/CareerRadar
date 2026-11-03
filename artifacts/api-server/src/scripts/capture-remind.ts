/**
 * Runs the real notification generator once against the LOCAL capture
 * database, the step the 6-hourly cron performs in production. Used by
 * scripts/record-walkthrough.mjs after the demo account applies to a role
 * that closes soon, so the bell then shows a reminder the product wrote.
 */
import { pool } from "@workspace/db";
import { generateNotifications } from "../notifications/generator";

const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error(`capture-remind only runs against a local database`);
}

const report = await generateNotifications();
console.log(`reminders: ${report.deadlineReminders}`);
await pool.end();
