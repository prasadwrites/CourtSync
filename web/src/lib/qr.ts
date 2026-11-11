/** QR payload on a customer's booking pass. The company id lets staff catch passes for another venue. */
export function qrPayload(companyId: string, token: string): string {
  return `courtsync:${companyId}:${token}`;
}

export function parseQr(text: string): { companyId: string | null; token: string } | null {
  const t = text.trim();
  const m = /^courtsync:([A-Za-z0-9_-]+):([A-Za-z0-9_-]{16,128})$/.exec(t);
  if (m) return { companyId: m[1], token: m[2] };
  if (/^[A-Za-z0-9_-]{16,128}$/.test(t)) return { companyId: null, token: t };
  return null;
}
