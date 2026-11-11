/** Masks an identifier, keeping only the last `visible` alphanumeric characters. */
export function maskIdentifier(value: string, visible = 4): string {
  const clean = value.replace(/\s+/g, '');
  if (clean.length <= visible) return '*'.repeat(clean.length);
  return '*'.repeat(Math.min(8, clean.length - visible)) + clean.slice(-visible);
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return maskIdentifier(email);
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone: string): string {
  return phone.length <= 4 ? '****' : `${phone.slice(0, 3)}****${phone.slice(-2)}`;
}
