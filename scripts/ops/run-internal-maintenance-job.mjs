import { runMaintenanceJob } from "./internal-maintenance-job.mjs";

const [job, option, extra] = process.argv.slice(2);
try {
  if ((option && option !== "--check") || extra) throw new Error("INVALID_JOB_ARGUMENTS");
  const summary = await runMaintenanceJob(job, { check: option === "--check" });
  console.log(JSON.stringify({ job, ...summary }));
  if (summary.failures > 0) process.exitCode = 1;
} catch {
  console.error("JIANLIAN_MAINTENANCE_JOB_FAILED");
  process.exitCode = 1;
}
