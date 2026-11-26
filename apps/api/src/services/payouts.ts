import type { Types } from 'mongoose';
import { env } from '../config/env';
import { conflict } from '../lib/errors';
import { eatDateString } from '../lib/time';
import { Booking, Business, Payout } from '../models';

/**
 * Creates one pending payout per shop for completed bookings that have passed the hold period
 * (PAYOUT_HOLD_DAYS, so disputes can be raised first) and are not disputed or already paid out.
 * The admin then pays each payout by M-Pesa and records the reference.
 */
export async function generatePayouts(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.PAYOUT_HOLD_DAYS * 86400e3);
  const rows = await Booking.aggregate<{ _id: Types.ObjectId; ids: Types.ObjectId[]; gross: number }>([
    { $match: { status: 'completed', payoutId: { $exists: false }, disputed: { $ne: true }, completedAt: { $lte: cutoff }, amountPaid: { $gt: 0 } } },
    { $group: { _id: '$businessId', ids: { $push: '$_id' }, gross: { $sum: { $subtract: ['$amountPaid', '$refundDue'] } } } },
  ]);
  let created = 0;
  for (const r of rows) {
    if (r.gross <= 0) continue;
    const biz = await Business.findById(r._id).select('commissionRate');
    const commission = Math.round(r.gross * (biz?.commissionRate ?? 0));
    const payout = await Payout.create({
      businessId: r._id, periodEnd: eatDateString(cutoff), bookingIds: r.ids, bookingCount: r.ids.length,
      gross: r.gross, commission, net: r.gross - commission, status: 'pending',
    });
    // claim the bookings; the guard stops a second payout from including the same ones
    await Booking.updateMany({ _id: { $in: r.ids }, payoutId: { $exists: false } }, { $set: { payoutId: payout._id } });
    created++;
  }
  return created;
}

export async function markPayoutPaid(id: string, mpesaReference: string) {
  const r = await Payout.updateOne({ _id: id, status: 'pending' }, { $set: { status: 'paid', paidAt: new Date(), mpesaReference } });
  if (r.modifiedCount !== 1) throw conflict('This payout is not pending');
}

export async function earningsFor(businessId: Types.ObjectId) {
  const [upcoming] = await Booking.aggregate<{ paid: number; n: number }>([
    { $match: { businessId, status: 'confirmed' } },
    { $group: { _id: null, paid: { $sum: '$amountPaid' }, n: { $sum: 1 } } },
  ]);
  const [awaiting] = await Booking.aggregate<{ gross: number; n: number }>([
    { $match: { businessId, status: 'completed', payoutId: { $exists: false } } },
    { $group: { _id: null, gross: { $sum: { $subtract: ['$amountPaid', '$refundDue'] } }, n: { $sum: 1 } } },
  ]);
  const biz = await Business.findById(businessId).select('commissionRate');
  const payouts = await Payout.find({ businessId }).sort('-createdAt').limit(50).lean();
  return {
    commissionRate: biz?.commissionRate ?? 0,
    confirmedPaid: upcoming?.paid ?? 0, confirmedCount: upcoming?.n ?? 0,
    awaitingPayout: awaiting?.gross ?? 0, awaitingCount: awaiting?.n ?? 0,
    payouts,
  };
}
