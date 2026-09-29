import "dotenv/config";
import { prisma } from "@/lib/db";
import { runAllJobs, runJob, type JobName, JOBS } from "@/lib/jobs";

async function main() {
  const name = process.argv[2] as JobName | undefined;
  const results = name ? [await runJob(name)] : await runAllJobs();
  for (const r of results) console.log(`${r.status.padEnd(7)} ${r.name} (${r.durationMs}ms)`, r.error ?? JSON.stringify(r.result));
  if (name && !(name in JOBS)) console.error(`Unknown job "${name}". Available: ${Object.keys(JOBS).join(", ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
