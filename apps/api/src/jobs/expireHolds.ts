import { expireHolds, sendReminders } from '../services/bookings';

/** Runs in-process every minute. With more than one API instance, run this on a single worker. */
export function startJobs(): () => void {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const n = await expireHolds();
      await sendReminders();
      if (n > 0) console.log(JSON.stringify({ level: 'info', msg: 'expired holds', count: n }));
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'expireHolds failed', error: (e as Error).message }));
    } finally {
      running = false;
    }
  }, 60_000);
  return () => clearInterval(timer);
}
