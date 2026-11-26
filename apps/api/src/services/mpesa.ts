import axios from 'axios';
import { randomBytes } from 'crypto';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

const base = env.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const auth = Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 15_000,
  });
  cached = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in ?? 3000) * 1000 };
  return cached.token;
}

export interface StkRequest { phone: string; amount: number; reference: string; description: string }

/** Starts an M-Pesa STK push. In mock mode nothing is sent and a fake request id is returned. */
export async function stkPush(r: StkRequest): Promise<{ checkoutRequestId: string }> {
  if (env.MPESA_ENV === 'mock') return { checkoutRequestId: `MOCK-${randomBytes(8).toString('hex')}` };
  try {
    const token = await accessToken();
    const timestamp = new Date(Date.now() + 3 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 14);
    const password = Buffer.from(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`).toString('base64');
    const { data } = await axios.post(
      `${base}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: env.MPESA_TXN_TYPE,
        Amount: Math.max(1, Math.round(r.amount)),
        PartyA: r.phone,
        PartyB: env.MPESA_SHORTCODE,
        PhoneNumber: r.phone,
        CallBackURL: `${env.PUBLIC_API_URL}/api/payments/mpesa/callback/${env.MPESA_CALLBACK_SECRET}`,
        AccountReference: r.reference,
        TransactionDesc: r.description.slice(0, 20),
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 20_000 },
    );
    if (String(data.ResponseCode) !== '0' || !data.CheckoutRequestID) {
      throw new Error(data.ResponseDescription ?? 'STK push rejected');
    }
    return { checkoutRequestId: String(data.CheckoutRequestID) };
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', msg: 'stk push failed', error: (e as Error).message }));
    throw new AppError(502, 'We could not start the M-Pesa prompt. Check the number and try again.');
  }
}

export interface ParsedCallback { checkoutRequestId: string; success: boolean; receipt?: string; amount?: number }

/** Reads the Daraja STK callback body. Returns null if it is not in the expected shape. */
export function parseCallback(body: unknown): ParsedCallback | null {
  const cb = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== 'string') return null;
  const items = ((cb.CallbackMetadata as { Item?: { Name: string; Value?: unknown }[] } | undefined)?.Item ?? []);
  const get = (n: string) => items.find((i) => i.Name === n)?.Value;
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    success: Number(cb.ResultCode) === 0,
    receipt: get('MpesaReceiptNumber') ? String(get('MpesaReceiptNumber')) : undefined,
    amount: get('Amount') !== undefined ? Number(get('Amount')) : undefined,
  };
}
