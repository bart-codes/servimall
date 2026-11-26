/** Returns a Kenyan mobile number as 2547XXXXXXXX / 2541XXXXXXXX, or null if invalid. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/[\s()-]/g, '');
  if (/^\+?254[17]\d{8}$/.test(d)) return d.replace('+', '');
  if (/^0[17]\d{8}$/.test(d)) return '254' + d.slice(1);
  return null;
}
