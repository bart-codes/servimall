# Docs

The full workspace document (requirements, architecture, database design, terms and
conditions of use, legal checklist) lives in the Claude doc:
https://claude.ai/artifact/M1pfAUPavEVKPMvkLacGmz

This folder holds the short, code-adjacent version.

## Decisions
- Web-based, mobile-first. A PWA wrapper can come later. No native apps.
- Service-first mall. Every shop lists **services**; goods (eggs, farm produce, mushroom
  grow kits) are services with `kind: "goods"`, a stock count and delivery or pickup.
- Version 1 covers one local region. The `Region` model exists so more regions are a
  data change, not a rewrite.
- You (the platform admin) handle and facilitate deliveries. The admin screen shows a
  daily delivery list and moves orders through confirmed, packed, out for delivery,
  then delivered or failed.
- Payments by M-Pesa STK push (Daraja). `MPESA_ENV=mock` simulates payments locally.
- No custom kiosk.
- Services priced "by quote" use a quote flow: request, offer (valid 7 days), accept and pay the
  deposit. The accepted offer becomes a project booking with a due date and no time slot.
- Reschedule: customers once, at least 24 hours ahead. Shops any time. The booking's slot keys
  are replaced in one atomic update, so the old slot frees and the new one is claimed together.
- Disputes hold a booking back from payout. Payouts are created per shop after `PAYOUT_HOLD_DAYS`.

## Architecture
```
React (Vite, Tailwind)  --HTTPS/JSON-->  Express API (TypeScript)
                                          |-- Mongoose --> MongoDB
                                          |-- Daraja STK push <-- callback
                                          '-- SMS provider (Africa's Talking) / WhatsApp links
```

### Double-booking guard
A booking occupies time "cells" (the shop's slot interval, default 30 minutes). Each cell
of each lane becomes a key `businessId:cellISO:lane` in `Booking.slotKeys`, covered by a
unique partial index. Creating a booking tries lane 0, then 1, up to the shop's
`concurrentCapacity`; a duplicate-key error means that lane is taken. Keys are removed
when a booking is cancelled or expires, so the slot reopens. No transactions needed.

### Stock guard
Goods stock is reserved with an atomic `$inc` guarded by `stockQuantity >= qty` when the
order is created, and returned if the order expires or is cancelled.

### Payment flow
1. Booking created as `pending_payment`; slot and stock held for `HOLD_MINUTES`.
2. STK push sent; a `Payment` row stores `checkoutRequestId`.
3. Daraja calls `/api/payments/mpesa/callback/:secret`; the handler is idempotent.
4. On success the booking becomes `confirmed` and SMS goes to the customer and the shop.
5. A job expires unpaid holds every minute. A payment that arrives after expiry sets
   `refundDue` so the admin can refund it.

## Known gaps (planned)
- Phone verification at sign-up, email verification, login by SMS code
- Subscriptions (weekly eggs), rider assignment, multi-shop cart
- Automatic refunds and payouts through Daraja (B2C and reversals need Safaricom production
  approval). Refunds are recorded as `refundDue` and marked paid by the admin; payouts are
  created in the app and paid by the admin, who records the M-Pesa reference.
- `commissionRate` defaults to 0 for the pilot; set it per shop in the database when you start charging.
