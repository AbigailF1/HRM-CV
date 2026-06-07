import { randomUUID } from "node:crypto";

import { logger } from "../../lib/logger.js";
import type { RenderedEmail } from "./email.templates.js";

export type EmailProviderMessage = RenderedEmail & {
  to: {
    email: string;
    name: string | null;
  };
  templateKey: string;
};

export type EmailProviderResult = {
  providerMessageId: string;
};

export class EmailProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "EmailProviderError";
    this.retryable = retryable;
  }
}

export type EmailProvider = {
  send(message: EmailProviderMessage): Promise<EmailProviderResult>;
};

export const createLogEmailProvider = (): EmailProvider => {
  return {
    async send(message) {
      const providerMessageId = `log_${randomUUID()}`;

      logger.info(
        {
          provider: "log",
          providerMessageId,
          recipientEmail: message.to.email,
          recipientName: message.to.name,
          templateKey: message.templateKey,
          subject: message.subject,
        },
        "email provider logged message",
      );

      return { providerMessageId };
    },
  };
};

export const createEmailProvider = (): EmailProvider => {
  const provider = process.env.EMAIL_PROVIDER?.trim() || "log";

  if (provider !== "log" && provider !== "smtp") {
    throw new Error("EMAIL_PROVIDER must be one of: log, smtp.");
  }

  if (provider === "smtp") {
    for (const envName of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]) {
      if (!process.env[envName]?.trim()) {
        throw new Error(`Missing required environment variable: ${envName}`);
      }
    }

    return {
      async send() {
        throw new EmailProviderError(
          "SMTP email provider requires a mail transport dependency before it can send.",
          false,
        );
      },
    };
  }

  return createLogEmailProvider();
};
