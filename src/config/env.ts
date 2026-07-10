import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config();

const DEFAULT_PORT = 3000;
const DEFAULT_MAX_RESUME_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_EMAIL_PROVIDER = "log";
const DEFAULT_TRUST_PROXY_HOPS = 0;
const DEFAULT_APPLICATION_SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_APPLICATION_SUBMIT_LIMIT = 5;
const DEFAULT_PUBLIC_READ_WINDOW_MS = 60 * 1000;
const DEFAULT_PUBLIC_READ_LIMIT = 60;
const DEFAULT_AUTH_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_AUTH_LIMIT = 100;
const DEFAULT_MAX_CV_RANKER_FILES = 10;
const DEFAULT_RATE_LIMIT_ENABLED = process.env.NODE_ENV !== "test";

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

const parseLlmProvider = (value: string | undefined) => {
  const provider = value?.trim().toLowerCase() || "none";

  if (!["none", "openai", "gemini"].includes(provider)) {
    throw new Error("CV_RANKER_LLM_PROVIDER must be one of: none, openai, gemini.");
  }

  return provider as "none" | "openai" | "gemini";
};

const parseNonNegativeInteger = (value: string | undefined, name: string, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsedValue;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
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
  cvRanker: Object.freeze({
    filesDir: resolve(uploadsRootDir, "cv-ranker"),
    maxFiles: parsePositiveInteger(
      process.env.CV_RANKER_MAX_FILES,
      "CV_RANKER_MAX_FILES",
      DEFAULT_MAX_CV_RANKER_FILES,
    ),
    maxFileSizeBytes: parsePositiveInteger(
      process.env.CV_RANKER_MAX_FILE_SIZE_BYTES,
      "CV_RANKER_MAX_FILE_SIZE_BYTES",
      DEFAULT_MAX_RESUME_FILE_SIZE_BYTES,
    ),
    llm: Object.freeze({
      provider: parseLlmProvider(process.env.CV_RANKER_LLM_PROVIDER),
      model: readOptionalEnv("CV_RANKER_LLM_MODEL"),
      openAiApiKey: readOptionalEnv("OPENAI_API_KEY"),
      geminiApiKey: readOptionalEnv("GEMINI_API_KEY"),
    }),
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
  rateLimit: Object.freeze({
    enabled: parseBoolean(process.env.RATE_LIMIT_ENABLED, DEFAULT_RATE_LIMIT_ENABLED),
    trustProxyHops: parseNonNegativeInteger(
      process.env.TRUST_PROXY_HOPS,
      "TRUST_PROXY_HOPS",
      DEFAULT_TRUST_PROXY_HOPS,
    ),
    applicationSubmit: Object.freeze({
      windowMs: parsePositiveInteger(
        process.env.RATE_LIMIT_APPLICATION_WINDOW_MS,
        "RATE_LIMIT_APPLICATION_WINDOW_MS",
        DEFAULT_APPLICATION_SUBMIT_WINDOW_MS,
      ),
      limit: parsePositiveInteger(
        process.env.RATE_LIMIT_APPLICATION_LIMIT,
        "RATE_LIMIT_APPLICATION_LIMIT",
        DEFAULT_APPLICATION_SUBMIT_LIMIT,
      ),
    }),
    publicRead: Object.freeze({
      windowMs: parsePositiveInteger(
        process.env.RATE_LIMIT_PUBLIC_READ_WINDOW_MS,
        "RATE_LIMIT_PUBLIC_READ_WINDOW_MS",
        DEFAULT_PUBLIC_READ_WINDOW_MS,
      ),
      limit: parsePositiveInteger(
        process.env.RATE_LIMIT_PUBLIC_READ_LIMIT,
        "RATE_LIMIT_PUBLIC_READ_LIMIT",
        DEFAULT_PUBLIC_READ_LIMIT,
      ),
    }),
    auth: Object.freeze({
      windowMs: parsePositiveInteger(
        process.env.RATE_LIMIT_AUTH_WINDOW_MS,
        "RATE_LIMIT_AUTH_WINDOW_MS",
        DEFAULT_AUTH_WINDOW_MS,
      ),
      limit: parsePositiveInteger(
        process.env.RATE_LIMIT_AUTH_LIMIT,
        "RATE_LIMIT_AUTH_LIMIT",
        DEFAULT_AUTH_LIMIT,
      ),
    }),
  }),
});
