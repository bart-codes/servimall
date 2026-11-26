# Deployment checklist

## Before launch
- [ ] Register the business, get a KRA PIN, county permit if required.
- [ ] Register with the Office of the Data Protection Commissioner if applicable.
- [ ] Have a Kenyan advocate review the terms (workspace doc, section 5) and fill in the
      placeholders in `apps/web/src/pages/Terms.tsx`.
- [ ] Safaricom Daraja: create an app, request production credentials for your Paybill or
      Till, set `MPESA_ENV=production`, and set `MPESA_TXN_TYPE` to match.
- [ ] The callback URL (`PUBLIC_API_URL/api/payments/mpesa/callback/<secret>`) must be
      public HTTPS. Keep `MPESA_CALLBACK_SECRET` long and random.
- [ ] Set a strong `JWT_SECRET` (32+ chars) and `CLIENT_ORIGIN` to your real web origin.
- [ ] MongoDB Atlas (or similar) with backups on, an IP access list and a dedicated user.
- [ ] SMS: set `AT_USERNAME` and `AT_API_KEY` (Africa's Talking). Required in production: password
      reset codes and reminders are sent by SMS.
- [ ] Images: create a Cloudinary account and set the three `CLOUDINARY_*` variables, or leave them
      empty to turn uploads off.
- [ ] Decide `PAYOUT_HOLD_DAYS` (default 2) and each shop's commission rate.
- [ ] Run `npm run seed` once, then change the admin password immediately.

## Hosting (simple setup)
- API: any Node 20+ host, or the Dockerfile in `apps/api`. Run one instance first: the
  hold-expiry job runs in-process (with several instances, move it to one worker).
- Web: `npm run build -w @mall/web`, then serve `apps/web/dist` from static hosting. Set
  `VITE_API_URL` at build time.
- Put both behind HTTPS.

## Monitoring
- Add uptime checks on `/health` and error tracking (for example Sentry).
- Test restoring a database backup once.
