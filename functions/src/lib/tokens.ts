import { randomBytes, randomInt } from 'node:crypto';

/** 256-bit URL-safe token for QR codes. Not derived from any customer data. */
export function checkInToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}
