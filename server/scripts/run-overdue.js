import { runOverdueJobRequest } from '../src/utils/overdue-job.js';

try {
  const result = await runOverdueJobRequest({
    hostport: process.env.API_HOSTPORT,
    secret: process.env.CRON_SECRET,
  });
  console.log(`Overdue check completed with HTTP ${result.status}.`);
} catch (error) {
  console.error(`Overdue check failed: ${error.message}`);
  process.exitCode = 1;
}
