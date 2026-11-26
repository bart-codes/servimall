# Services Mall

A web-based, mobile-first online mall for local services and goods. Customers browse shops,
book a service (or order eggs, produce and mushroom grow kits), and pay by M-Pesa. Shop owners
manage services, hours and bookings. The platform admin approves shops and handles deliveries.

TypeScript throughout: Express 5 + Mongoose API, React + Vite + Tailwind web app.

```
apps/api   Express API, MongoDB models, M-Pesa (Daraja), SMS, hold-expiry job
apps/web   React web app (customer, shop owner and admin screens)
docs       Decisions, architecture notes, deployment checklist
```

Full requirements, architecture, database design and the draft terms of use are in the
workspace doc: https://claude.ai/artifact/M1pfAUPavEVKPMvkLacGmz

## Run it locally

Needs Node 20+ and MongoDB (Docker is the easiest).

```bash
docker compose up -d                       # MongoDB on localhost:27017
npm install                                # installs both apps

cp apps/api/.env.example apps/api/.env     # then set JWT_SECRET, SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD
cp apps/web/.env.example apps/web/.env

npm run seed                               # region, admin, two sample shops, a delivery zone
npm run dev:api                            # http://localhost:4000
npm run dev:web                            # http://localhost:5173
```

With `MPESA_ENV=mock` (the default) no real payment is made: the STK prompt is simulated and
the payment succeeds after 3 seconds, so you can test the whole booking flow.

Tests and type checks:

```bash
npm test                # slot, delivery-window and phone logic (vitest)
npm run typecheck
```

## Try the flow
1. Open the web app, create a customer account, open **Ink Studio**, pick a day and time, pay the deposit.
2. Mark a service as **By quote**, ask for a quote as a customer, make an offer as the shop, accept it.
3. Order **Eggs (tray of 30)** for delivery. Sign in as the admin and open **Admin > Deliveries**
   to move it through packed, out for delivery, delivered.
4. Create a second account, choose **Open a shop**, fill it in, then approve it under **Admin > Shops**.

## What is built (version 1)
- Accounts (phone + password), password reset with an SMS code, roles: customer, owner, admin; terms acceptance recorded
- One local region (more regions are a data change); shops with categories and search
- Services (booked into a time slot) and goods (stock, quantity, delivery or pickup)
- Slot generation from opening hours and days off, multi-slot durations, shop capacity
- Double-booking protection with a unique index (see `docs/README.md`); stock reservation
- M-Pesa STK push, idempotent callback, 10-minute hold, retry payment, late-payment refund flag
- SMS confirmations and delivery updates (Africa's Talking, or logged when not configured)
- Cancellation with the shop's refund policy; refunds tracked for the admin to pay out
- Delivery zones and fees, delivery windows with cut-off, daily delivery list for the admin
- Reviews after completed bookings, shop replies, admin moderation; draft terms of use page
- Quote requests: customer describes the job, shop offers a price and date, customer accepts and pays the deposit
- Reschedule: customers once and at least 24 hours ahead, shops any time; the slot moves atomically
- SMS reminders 24 hours and 2 hours before a booking
- Problem reports (disputes): the booking is held back from payout until the admin resolves it, with an optional refund
- Shop earnings view, platform commission, payouts the admin creates, pays and records
- Image uploads for shop logos and service photos (signed direct upload to Cloudinary)

## Not built yet
Subscriptions (for example a weekly egg order), rider assignment, a multi-shop cart, and automatic
refunds and payouts through Daraja (these need Safaricom production approval, so refunds and payouts
are tracked in the app and sent by you). See `docs/README.md`.

## Before real customers
Read `docs/DEPLOYMENT.md`. The terms page is a draft and needs a Kenyan advocate's review.
This code was type-checked in parts and its pure logic is unit-tested, but it has not been run
against a live database or the Daraja sandbox yet. Do that first, with `MPESA_ENV=sandbox`.

## API overview
Public: `GET /api/regions`, `/businesses`, `/businesses/:slug`, `/services/:id/slots?date=`, `/delivery-zones`
Auth: `POST /api/auth/register|login|forgot|reset`, `GET /api/auth/me`
Quotes: `POST /api/quotes`, `GET /api/quotes/mine`, `POST /api/quotes/:id/accept|decline`
Uploads: `POST /api/uploads/sign`
Customer: `POST /api/bookings`, `GET /api/bookings/mine|:id`, `POST /api/bookings/:id/pay|cancel|review|reschedule|dispute`
Owner: `/api/owner/businesses`, `/businesses/:id/services|availability`, `/services/:id`, `/bookings`, `/bookings/:id/status|delivery|reschedule`, `/quotes`, `/quotes/:id/offer|decline`, `/reviews`, `/reviews/:id/reply`, `/earnings`
Admin: `/api/admin/businesses`, `/zones`, `/regions`, `/deliveries`, `/refunds`, `/bookings/:id/delivery|refunded`, `/payouts`, `/payouts/generate`, `/payouts/:id/paid`, `/disputes`, `/disputes/:id/resolve`, `/reviews`, `/reviews/:id/visibility`
Payments: `POST /api/payments/mpesa/callback/:secret` (Daraja)
# servimall
