import "dotenv/config";
import { afterAll, beforeEach } from "vitest";

(process.env as Record<string, string>).NODE_ENV = "test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { prisma } = await import("@/lib/db");
const { setEmailTransport, ConsoleEmailTransport } = await import("@/lib/notifications/email");

export const emailOutbox = new ConsoleEmailTransport();
setEmailTransport(emailOutbox);

/** Truncates every table (except migrations) so each test starts clean. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  emailOutbox.sent.length = 0;
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
