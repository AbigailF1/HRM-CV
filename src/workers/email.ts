import { logger } from "../lib/logger.js";
import { startEmailWorker } from "../modules/email/email.worker.js";

const worker = startEmailWorker();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "email worker shutdown signal received");

    worker
      .stop()
      .then(() => {
        logger.info({ signal }, "email worker shutdown complete");
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          "email worker shutdown failed",
        );
        process.exit(1);
      });
  });
}
