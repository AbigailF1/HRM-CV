import dotenv from "dotenv";

dotenv.config();

const DEFAULT_PORT = 3000;

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

export const env = Object.freeze({
  port: parsePort(process.env.PORT),
  databaseUrl: readRequiredEnv("DATABASE_URL"),
  auth: Object.freeze({
    url: authUrl.toString(),
    origin: authUrl.origin,
    secret: readRequiredEnv("BETTER_AUTH_SECRET"),
    trustedOrigins: parseTrustedOrigins(authUrl.origin),
  }),
});
