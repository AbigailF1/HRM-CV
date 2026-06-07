import { logger } from "../../lib/logger.js";
import { disconnectPrisma } from "../../lib/prisma.js";
import { createEmailService, type EmailService } from "./email.service.js";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
};

export type EmailWorkerOptions = {
  batchSize?: number;
  pollIntervalMs?: number;
  service?: EmailService;
};

export const runEmailWorkerOnce = async (
  service: EmailService = createEmailService(),
  batchSize = DEFAULT_BATCH_SIZE,
) => {
  return service.processDueEmailJobs(batchSize);
};

export const startEmailWorker = (options: EmailWorkerOptions = {}) => {
  const service = options.service ?? createEmailService();
  const batchSize =
    options.batchSize ?? parsePositiveInteger(process.env.EMAIL_WORKER_BATCH_SIZE, DEFAULT_BATCH_SIZE);
  const pollIntervalMs =
    options.pollIntervalMs ??
    parsePositiveInteger(process.env.EMAIL_WORKER_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS);
  let isStopping = false;
  let isProcessing = false;
  let timer: NodeJS.Timeout | null = null;

  const scheduleNextRun = () => {
    if (isStopping) {
      return;
    }

    timer = setTimeout(processJobs, pollIntervalMs);
  };

  const processJobs = async () => {
    if (isProcessing) {
      scheduleNextRun();
      return;
    }

    isProcessing = true;

    try {
      const result = await runEmailWorkerOnce(service, batchSize);

      if (result.processed > 0) {
        logger.info(result, "email worker processed jobs");
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "email worker failed",
      );
    } finally {
      isProcessing = false;
      scheduleNextRun();
    }
  };

  processJobs();

  return {
    async stop() {
      isStopping = true;

      if (timer) {
        clearTimeout(timer);
      }

      await disconnectPrisma();
    },
  };
};
