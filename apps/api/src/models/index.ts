import { Schema, model } from 'mongoose';

export const CATEGORIES = ['body-art', 'home-services', 'food', 'farm-goods', 'digital'] as const;
export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'completed',
  'cancelled_by_customer',
  'cancelled_by_shop',
  'no_show',
  'expired',
] as const;
export const DELIVERY_STATUSES = ['confirmed', 'packed', 'out_for_delivery', 'delivered', 'failed'] as const;
export const LOCATION_TYPES = ['at_shop', 'at_customer', 'online'] as const;
export const FULFILMENT = ['delivery', 'pickup'] as const;

// ---------- users ----------
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, unique: true },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['customer', 'owner', 'admin'], default: 'customer' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    acceptedTermsVersion: String,
    acceptedTermsAt: Date,
  },
  { timestamps: true },
);
export const User = model('User', userSchema);

// ---------- regions ----------
const regionSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    towns: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Region = model('Region', regionSchema);

// ---------- businesses (shops) ----------
const businessSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    regionId: { type: Schema.Types.ObjectId, ref: 'Region', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String, default: '', maxlength: 2000 },
    logoUrl: String,
    phone: { type: String, required: true },
    whatsapp: String,
    town: { type: String, required: true },
    address: String,
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
    concurrentCapacity: { type: Number, default: 1, min: 1, max: 20 },
    cancellationPolicy: {
      fullRefundHours: { type: Number, default: 48 },
      partialRefundHours: { type: Number, default: 24 },
      partialRefundPercent: { type: Number, default: 50 },
    },
    commissionRate: { type: Number, default: 0, min: 0, max: 0.5 },
    ratingAverage: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
businessSchema.index({ regionId: 1, status: 1, category: 1 });
export const Business = model('Business', businessSchema);

// ---------- services (also used for goods) ----------
const serviceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    regionId: { type: Schema.Types.ObjectId, ref: 'Region', required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 1000 },
    kind: { type: String, enum: ['service', 'goods'], required: true },
    price: { type: Number, required: true, min: 0 },
    priceType: { type: String, enum: ['fixed', 'from', 'quote'], default: 'fixed' },
    durationMinutes: { type: Number, default: 60 },
    depositType: { type: String, enum: ['none', 'fixed', 'percent'], default: 'none' },
    depositValue: { type: Number, default: 0 },
    locationOptions: { type: [{ type: String, enum: LOCATION_TYPES }], default: [] },
    leadTimeHours: { type: Number, default: 2 },
    // goods
    fulfilmentOptions: { type: [{ type: String, enum: FULFILMENT }], default: [] },
    unit: String,
    stockQuantity: { type: Number, min: 0 },
    deliveryCutoffHour: { type: Number, default: 18, min: 0, max: 23 },
    photos: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Service = model('Service', serviceSchema);

// ---------- availability (one per shop) ----------
const availabilitySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, unique: true },
    weeklyHours: {
      type: [{ _id: false, day: { type: Number, min: 0, max: 6 }, open: String, close: String }],
      default: [],
    },
    daysOff: {
      type: [{ _id: false, from: String, to: String, reason: String }],
      default: [],
    },
    slotIntervalMinutes: { type: Number, default: 30, min: 15, max: 120 },
  },
  { timestamps: true },
);
export const Availability = model('Availability', availabilitySchema);

// ---------- delivery zones (managed by the platform admin) ----------
const zoneSchema = new Schema(
  {
    regionId: { type: Schema.Types.ObjectId, ref: 'Region', required: true, index: true },
    name: { type: String, required: true },
    towns: { type: [String], default: [] },
    fee: { type: Number, required: true, min: 0 },
    freeDeliveryOver: Number,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const DeliveryZone = model('DeliveryZone', zoneSchema);

// ---------- bookings (orders for goods are bookings too) ----------
const deliverySchema = new Schema(
  {
    zoneId: { type: Schema.Types.ObjectId, ref: 'DeliveryZone' },
    windowDate: String,
    windowKey: String,
    mapPin: { lat: Number, lng: Number },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'confirmed' },
    deliveredAt: Date,
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    regionId: { type: Schema.Types.ObjectId, ref: 'Region', required: true },
    kind: { type: String, enum: ['service', 'goods'], required: true },
    serviceName: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },
    depositDue: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    slotStart: Date,
    slotEnd: Date,
    slotKeys: { type: [String], default: undefined },
    locationType: { type: String, enum: LOCATION_TYPES },
    fulfilment: { type: String, enum: FULFILMENT },
    customerAddress: String,
    notes: { type: String, maxlength: 500 },
    delivery: deliverySchema,
    status: { type: String, enum: BOOKING_STATUSES, required: true },
    holdExpiresAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    completedAt: Date,
    refundDue: { type: Number, default: 0 },
    refundedAt: Date,
    rescheduleCount: { type: Number, default: 0 },
    reminder24SentAt: Date,
    reminder2SentAt: Date,
    quoteId: { type: Schema.Types.ObjectId, ref: 'Quote' },
    projectDeadline: String,
    disputed: { type: Boolean, default: false },
    payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
  },
  { timestamps: true },
);
// Prevents double booking: every occupied time cell of every lane is a unique key.
bookingSchema.index({ slotKeys: 1 }, { unique: true, partialFilterExpression: { slotKeys: { $exists: true } } });
bookingSchema.index({ businessId: 1, slotStart: 1 });
bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ status: 1, holdExpiresAt: 1 });
bookingSchema.index({ businessId: 1, status: 1, createdAt: -1 });
bookingSchema.index({ kind: 1, 'delivery.windowDate': 1 });
export const Booking = model('Booking', bookingSchema);

// ---------- payments ----------
const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    amount: { type: Number, required: true },
    purpose: { type: String, enum: ['deposit', 'full'], required: true },
    method: { type: String, default: 'mpesa' },
    phoneUsed: String,
    checkoutRequestId: { type: String, required: true, unique: true },
    mpesaReceipt: String,
    status: { type: String, enum: ['initiated', 'succeeded', 'failed'], default: 'initiated' },
    rawCallback: Schema.Types.Mixed,
    commissionAmount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const Payment = model('Payment', paymentSchema);

// ---------- reviews ----------
const reviewSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
    ownerReply: { type: String, maxlength: 500 },
    ownerRepliedAt: Date,
  },
  { timestamps: true },
);
export const Review = model('Review', reviewSchema);

// ---------- quotes (services priced by quote: web, graphic design, catering, custom jobs) ----------
const quoteSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    regionId: { type: Schema.Types.ObjectId, ref: 'Region', required: true },
    serviceName: { type: String, required: true },
    brief: { type: String, required: true, maxlength: 2000 },
    preferredDate: String,
    contactPhone: { type: String, required: true },
    priceOffered: Number,
    deadline: String,
    note: { type: String, maxlength: 500 },
    status: { type: String, enum: ['requested', 'offered', 'accepted', 'declined', 'expired'], default: 'requested' },
    offerExpiresAt: Date,
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
  },
  { timestamps: true },
);
quoteSchema.index({ customerId: 1, createdAt: -1 });
quoteSchema.index({ businessId: 1, status: 1, createdAt: -1 });
export const Quote = model('Quote', quoteSchema);

// ---------- one-time codes (password reset) ----------
const otpSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['reset'], default: 'reset' },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    usedAt: Date,
  },
  { timestamps: true },
);
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 }); // codes are deleted an hour after they expire
export const OtpCode = model('OtpCode', otpSchema);

// ---------- payouts to shops ----------
const payoutSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    periodEnd: { type: String, required: true },
    bookingIds: { type: [Schema.Types.ObjectId], default: [] },
    bookingCount: { type: Number, required: true },
    gross: { type: Number, required: true },
    commission: { type: Number, required: true },
    net: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidAt: Date,
    mpesaReference: String,
  },
  { timestamps: true },
);
export const Payout = model('Payout', payoutSchema);

// ---------- disputes ----------
const disputeSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    reason: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolution: { type: String, maxlength: 1000 },
    refundAmount: { type: Number, default: 0 },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true },
);
disputeSchema.index({ status: 1, createdAt: 1 });
export const Dispute = model('Dispute', disputeSchema);
