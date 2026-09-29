import "dotenv/config";
import { execSync } from "node:child_process";

/** Applies migrations to the E2E database before the web server starts. */
export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL (or TEST_DATABASE_URL) must be set");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
