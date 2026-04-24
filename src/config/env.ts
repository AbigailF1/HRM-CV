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

export const env = Object.freeze({
  port: parsePort(process.env.PORT),
  databaseUrl: readRequiredEnv("DATABASE_URL")
});
