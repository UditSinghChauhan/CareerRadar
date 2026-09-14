import app from "./app";
import { logger } from "./lib/logger";
import { runSchemaCheck } from "./lib/schema-check";
import { schedulerService } from "./providers/scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Boot-time schema drift check. Logs SCHEMA DRIFT with the exact missing
  // columns; /api/health(z) then answers 503 until the migration lands. The
  // service still starts — routes that do not touch the missing columns keep
  // working, and the health check is what makes the deploy visibly red.
  void runSchemaCheck().finally(() => {
    schedulerService.start();
  });
});
