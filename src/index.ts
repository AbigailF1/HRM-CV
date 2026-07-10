import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { disconnectPrisma, getPrisma } from "./lib/prisma.js";
import { createCvRankerService } from "./modules/cv-ranker/cv-ranker.service.js";

const DB_MAX_ATTEMPTS = 3;
const DB_RETRY_DELAY_MS = 2_000;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const waitForDatabase = async () => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DB_MAX_ATTEMPTS; attempt += 1) {
    try {
      const prisma = getPrisma();

      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (error) {
      lastError = error;

      if (attempt < DB_MAX_ATTEMPTS) {
        logger.warn(
          {
            attempt,
            maxAttempts: DB_MAX_ATTEMPTS,
            retryDelayMs: DB_RETRY_DELAY_MS,
            err: error instanceof Error ? error : undefined,
          },
          "database readiness check failed; retrying",
        );
        await sleep(DB_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error("Database readiness check failed.", { cause: lastError });
};

const startServer = async () => {
  await waitForDatabase();
  logger.info({ maxAttempts: DB_MAX_ATTEMPTS }, "database readiness check passed");

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info({ port: env.port }, "api listening");
  });
  const cvRankerService = createCvRankerService();

  setTimeout(() => {
    void cvRankerService
      .recoverPendingRankJobs()
      .then((count) => {
        if (count > 0) {
          logger.info({ count }, "cv ranker recovery jobs scheduled");
        }
      })
      .catch((error) => {
        logger.error(
          { err: error instanceof Error ? error : undefined },
          "cv ranker recovery failed",
        );
      });
  }, 0);

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutdown signal received");

    server.close(async (serverError) => {
      if (serverError) {
        logger.error(
          { signal, err: serverError },
          "failed to close http server cleanly",
        );
        process.exitCode = 1;
      }

      try {
        await disconnectPrisma();
      } catch (disconnectError) {
        logger.error(
          { signal, err: disconnectError instanceof Error ? disconnectError : undefined },
          "failed to disconnect prisma cleanly",
        );
        process.exitCode = 1;
      }

      logger.info({ signal, exitCode: process.exitCode ?? 0 }, "shutdown complete");
      process.exit();
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

void startServer().catch(async (error) => {
  logger.error(
    { err: error instanceof Error ? error : undefined },
    "api startup failed",
  );
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
