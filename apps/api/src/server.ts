import mongoose from 'mongoose';
import { app } from './app';
import { env } from './config/env';
import { startJobs } from './jobs/expireHolds';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  // Build indexes before serving: the unique slot index is what prevents double booking.
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  const stopJobs = startJobs();
  const server = app.listen(env.PORT, () =>
    console.log(JSON.stringify({ level: 'info', msg: 'api listening', port: env.PORT, mpesa: env.MPESA_ENV })),
  );

  const shutdown = (signal: string) => {
    console.log(JSON.stringify({ level: 'info', msg: 'shutting down', signal }));
    stopJobs();
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
