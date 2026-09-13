import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { normalizeConnectionString } from "./connection-string";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  // Pins sslmode=require to its current meaning, verify-full, so Neon stops
  // emitting pg's deprecation warning on every connection. See
  // ./connection-string.ts for why this is the right side of that change.
  connectionString: normalizeConnectionString(process.env.DATABASE_URL),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export { normalizeConnectionString } from "./connection-string";
