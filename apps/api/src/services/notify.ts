import axios from 'axios';
import { env } from '../config/env';

/** Sends an SMS through Africa's Talking. Without credentials it logs the message instead. */
export async function sendSms(phone: string, message: string): Promise<void> {
  if (!env.AT_USERNAME || !env.AT_API_KEY) {
    console.log(JSON.stringify({ level: 'info', sms: { to: phone, message } }));
    return;
  }
  try {
    const host = env.AT_USERNAME === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const body = new URLSearchParams({ username: env.AT_USERNAME, to: `+${phone}`, message });
    if (env.AT_SENDER_ID) body.set('from', env.AT_SENDER_ID);
    await axios.post(`https://${host}/version1/messaging`, body, {
      headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10_000,
    });
  } catch (e) {
    // A failed SMS must never fail a booking.
    console.error(JSON.stringify({ level: 'error', msg: 'sms failed', to: phone, error: (e as Error).message }));
  }
}

export const whatsappLink = (phone: string, text: string) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
