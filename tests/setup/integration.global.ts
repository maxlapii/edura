import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Runs once before the integration project: applies migrations to the test database.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL must be set to run integration tests");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
