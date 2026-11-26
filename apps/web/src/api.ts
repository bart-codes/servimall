import { useCallback, useEffect, useState } from 'react';

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const TOKEN_KEY = 'mall_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const t = tokenStore.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Something went wrong');
  return data as T;
}

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await run());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [run]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}

// ------------------------------------------------------------------ types
export type Category = 'body-art' | 'home-services' | 'food' | 'farm-goods' | 'digital';
export const CATEGORY_LABELS: Record<Category, string> = {
  'body-art': 'Body art',
  'home-services': 'Home services',
  food: 'Food and catering',
  'farm-goods': 'Farm goods',
  digital: 'Web and design',
};

export interface Region { _id: string; name: string; towns: string[] }
export interface Business {
  _id: string; name: string; slug: string; category: Category; description: string; town: string;
  phone: string; whatsapp?: string; status: 'pending' | 'active' | 'suspended'; regionId: string;
  ratingAverage: number; ratingCount: number; serviceCount?: number; fromPrice?: number | null;
  concurrentCapacity?: number; address?: string; logoUrl?: string;
}
export interface Service {
  _id: string; businessId: string; regionId: string; name: string; description: string; kind: 'service' | 'goods';
  price: number; priceType: 'fixed' | 'from' | 'quote'; durationMinutes: number;
  depositType: 'none' | 'fixed' | 'percent'; depositValue: number;
  locationOptions: ('at_shop' | 'at_customer' | 'online')[]; fulfilmentOptions: ('delivery' | 'pickup')[];
  unit?: string; stockQuantity?: number; deliveryCutoffHour: number; leadTimeHours: number; active: boolean; photos?: string[];
}
export interface Zone { _id: string; name: string; fee: number; freeDeliveryOver?: number; regionId: string; active: boolean }
export type BookingStatus =
  | 'pending_payment' | 'confirmed' | 'completed' | 'cancelled_by_customer' | 'cancelled_by_shop' | 'no_show' | 'expired';
export interface Booking {
  _id: string; serviceId: string; reference: string; kind: 'service' | 'goods'; serviceName: string; quantity: number;
  rescheduleCount?: number; projectDeadline?: string; disputed?: boolean;
  total: number; depositDue: number; amountPaid: number; deliveryFee: number; status: BookingStatus;
  slotStart?: string; locationType?: string; fulfilment?: 'delivery' | 'pickup'; customerAddress?: string;
  delivery?: { status: string; windowDate?: string; windowKey?: string };
  refundDue: number; refundedAt?: string; createdAt: string;
  business?: { name: string; slug: string; phone: string; whatsapp?: string };
  customer?: { name: string; phone: string };
}

export interface Quote {
  _id: string; serviceName: string; brief: string; preferredDate?: string; contactPhone: string;
  priceOffered?: number; deadline?: string; note?: string; offerExpiresAt?: string; createdAt: string;
  status: 'requested' | 'offered' | 'accepted' | 'declined' | 'expired';
  business?: { name: string; slug: string; whatsapp?: string }; customer?: { name: string; phone: string };
}
export interface Review {
  _id: string; rating: number; comment: string; ownerReply?: string; status: 'visible' | 'hidden'; createdAt: string;
  customerName?: string; customer?: { name: string }; business?: { name: string };
}
export interface Payout {
  _id: string; periodEnd: string; bookingCount: number; gross: number; commission: number; net: number;
  status: 'pending' | 'paid'; paidAt?: string; mpesaReference?: string; business?: { name: string; phone: string };
}
export interface Dispute {
  _id: string; reason: string; status: 'open' | 'resolved'; resolution?: string; refundAmount: number; createdAt: string;
  customer?: { name: string; phone: string }; business?: { name: string };
  booking?: { reference: string; serviceName: string; total: number; amountPaid: number; refundDue: number; refundedAt?: string; status: string };
}

/** Cloudinary delivers a resized copy when sizes are added to the URL. Other hosts are returned unchanged. */
export const thumb = (url: string, w: number, h: number) =>
  url.includes('/upload/') ? url.replace('/upload/', `/upload/c_fill,w_${w},h_${h},q_auto,f_auto/`) : url;

// ------------------------------------------------------------------ formatting and delivery windows
export const money = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const TZ = 'Africa/Nairobi';
export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-KE', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

export const WINDOWS = {
  morning: { label: '8am to 12pm', start: 8 },
  afternoon: { label: '12pm to 5pm', start: 12 },
  evening: { label: '5pm to 8pm', start: 17 },
} as const;
export type WindowKey = keyof typeof WINDOWS;

const eat = (d: Date) => new Date(d.getTime() + 3 * 3600e3);
export const todayEat = () => eat(new Date()).toISOString().slice(0, 10);
export const addDaysStr = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Mirrors the server rule: after the cut-off hour, orders move to the next day. */
export const earliestDelivery = (cutoff: number) => (eat(new Date()).getUTCHours() < cutoff ? todayEat() : addDaysStr(todayEat(), 1));
export function windowsFor(date: string): WindowKey[] {
  const today = todayEat();
  return (Object.keys(WINDOWS) as WindowKey[]).filter((k) => {
    if (date !== today) return true;
    const n = eat(new Date());
    return WINDOWS[k].start * 60 >= n.getUTCHours() * 60 + n.getUTCMinutes() + 120;
  });
}

export const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Waiting for payment', confirmed: 'Confirmed', completed: 'Completed',
  cancelled_by_customer: 'Cancelled', cancelled_by_shop: 'Cancelled by shop', no_show: 'No-show', expired: 'Expired',
  packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', failed: 'Delivery failed',
};
