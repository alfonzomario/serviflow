import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const getDbUrl = () => {
  let url = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL || "";
  if (process.env.NODE_ENV === "production" && url && !url.includes("sslmode=")) {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}sslmode=no-verify`;
  }
  return url;
};

const dbUrl = getDbUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log:
      process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
