import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config();

const DEFAULT_PORT = 3000;
const DEFAULT_MAX_RESUME_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_EMAIL_PROVIDER = "log";

const readRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const parsePort = (value: string | undefined) => {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number(value);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
    throw new Error("PORT must be a valid TCP port number.");
  }

  return parsedPort;
};

const parsePositiveInteger = (value: string | undefined, name: string, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
};

const readOptionalEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const parseEmailProvider = (value: string | undefined) => {
  const provider = value?.trim() || DEFAULT_EMAIL_PROVIDER;

  if (provider !== "log" && provider !== "smtp") {
    throw new Error("EMAIL_PROVIDER must be one of: log, smtp.");
  }

  return provider;
};

const parseUrl = (value: string, name: string) => {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
};

const parseTrustedOrigins = (authOrigin: string) => {
  const configuredOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  const defaultDevOrigins =
    process.env.NODE_ENV === "production" ? [] : ["http://localhost:5000"];

  return [...new Set([authOrigin, ...defaultDevOrigins, ...configuredOrigins])].map(
    (origin) => parseUrl(origin, "BETTER_AUTH_TRUSTED_ORIGINS").origin,
  );
};

const authUrl = parseUrl(readRequiredEnv("BETTER_AUTH_URL"), "BETTER_AUTH_URL");
const uploadsRootDir = resolve(process.cwd(), process.env.UPLOADS_DIR?.trim() || "uploads");
const emailProvider = parseEmailProvider(process.env.EMAIL_PROVIDER);

if (emailProvider === "smtp") {
  for (const envName of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"]) {
    readRequiredEnv(envName);
  }
}

export const env = Object.freeze({
  port: parsePort(process.env.PORT),
  databaseUrl: readRequiredEnv("DATABASE_URL"),
  auth: Object.freeze({
    url: authUrl.toString(),
    origin: authUrl.origin,
    secret: readRequiredEnv("BETTER_AUTH_SECRET"),
    trustedOrigins: parseTrustedOrigins(authUrl.origin),
  }),
  uploads: Object.freeze({
    rootDir: uploadsRootDir,
    resumesDir: resolve(uploadsRootDir, "resumes"),
    maxResumeFileSizeBytes: parsePositiveInteger(
      process.env.RESUME_MAX_FILE_SIZE_BYTES,
      "RESUME_MAX_FILE_SIZE_BYTES",
      DEFAULT_MAX_RESUME_FILE_SIZE_BYTES,
    ),
  }),
  email: Object.freeze({
    provider: emailProvider,
    from: readOptionalEnv("EMAIL_FROM") ?? "no-reply@example.com",
    smtp: Object.freeze({
      host: readOptionalEnv("SMTP_HOST"),
      port: parsePositiveInteger(process.env.SMTP_PORT, "SMTP_PORT", 587),
      user: readOptionalEnv("SMTP_USER"),
      pass: readOptionalEnv("SMTP_PASS"),
    }),
  }),
});
