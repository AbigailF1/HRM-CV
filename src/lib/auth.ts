import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { env } from "../config/env.js";
import { getPrisma } from "./prisma.js";

const prisma = getPrisma();

export const auth = betterAuth({
  baseURL: env.auth.url,
  secret: env.auth.secret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: env.auth.trustedOrigins,
  experimental: {
    joins: true,
  },
});
