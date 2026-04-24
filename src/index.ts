import { createApp } from "./app";
import { env } from "./config/env";
import { disconnectPrisma, getPrisma } from "./lib/prisma";

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
        await sleep(DB_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error("Database readiness check failed.", { cause: lastError });
};

const startServer = async () => {
  await waitForDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.info(`API listening on port ${env.port}`);
  });

  const shutdown = (signal: string) => {
    console.info(`Received ${signal}, shutting down.`);

    server.close(async (serverError) => {
      if (serverError) {
        console.error("Failed to close HTTP server cleanly.", serverError);
        process.exitCode = 1;
      }

      try {
        await disconnectPrisma();
      } catch (disconnectError) {
        console.error("Failed to disconnect Prisma cleanly.", disconnectError);
        process.exitCode = 1;
      }

      process.exit();
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

void startServer().catch(async (error) => {
  console.error("API startup failed.", error);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
