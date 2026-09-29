/**
 * Ensures a SUPER_ADMIN account exists for the E2E run (DATABASE_URL points at the E2E database).
 * Usage: npx tsx tests/e2e/seed-super-admin.ts <email>
 */
import "dotenv/config";
import { prisma } from "@/lib/db";
import { createUserWithPassword } from "@/modules/users/service";

const email = process.argv[2] ?? "e2e-super@edura.dev";
const password = process.env.E2E_PASSWORD ?? "Password123!";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return;
  await createUserWithPassword({ name: "E2E Super Admin", email, password, role: "SUPER_ADMIN", schoolId: null });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
