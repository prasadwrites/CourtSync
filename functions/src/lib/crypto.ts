/**
 * AES-256-GCM encryption for identity document numbers.
 * The key (32 bytes, base64) is the ID_ENCRYPTION_KEY secret. Ciphertexts carry a key version
 * so the key can be rotated: add ID_ENCRYPTION_KEY_V2 and bump CURRENT_KEY_VERSION.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { getSecret } from './secrets';
import { isEmulator } from './firebase';
import { fail } from './errors';

const CURRENT_KEY_VERSION = 1;

async function key(version: number): Promise<Buffer> {
  const name = version === 1 ? 'ID_ENCRYPTION_KEY' : `ID_ENCRYPTION_KEY_V${version}`;
  const raw = await getSecret(name);
  if (raw) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) throw fail.internal('Encryption key is misconfigured.');
    return buf;
  }
  if (isEmulator) return createHash('sha256').update('courtsync-emulator-only-key').digest();
  throw fail.unavailable('Identity verification is not configured yet. Ask the platform administrator to set ID_ENCRYPTION_KEY.');
}

export interface Sealed {
  v: number;
  iv: string;
  tag: string;
  data: string;
}

export async function seal(plaintext: string, aad: string): Promise<Sealed> {
  const k = await key(CURRENT_KEY_VERSION);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { v: CURRENT_KEY_VERSION, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export async function open(sealed: Sealed, aad: string): Promise<string> {
  const k = await key(sealed.v);
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(sealed.iv, 'base64'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
}
