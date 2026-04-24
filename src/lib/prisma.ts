import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma__: PrismaClient | undefined;
}

let prismaClient: PrismaClient | undefined;

export const getPrisma = () => {
  if (!prismaClient) {
    prismaClient = globalThis.__prisma__ ?? new PrismaClient();

    if (process.env.NODE_ENV !== "production") {
      globalThis.__prisma__ = prismaClient;
    }
  }

  return prismaClient;
};

export const disconnectPrisma = async () => {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = undefined;

  if (process.env.NODE_ENV !== "production") {
    globalThis.__prisma__ = undefined;
  }
};
