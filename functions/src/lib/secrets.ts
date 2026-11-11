/**
 * Provider credentials live in Google Secret Manager, never in Firestore or client code.
 * Locally (emulators) they are read from environment variables, e.g. functions/.secret.local.
 * A missing secret disables the provider that needs it instead of failing deploys.
 */
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { isEmulator, projectId } from './firebase';

const cache = new Map<string, { value: string | null; at: number }>();
let client: SecretManagerServiceClient | null = null;
const TTL = 10 * 60_000;

export async function getSecret(name: string): Promise<string | null> {
  const env = process.env[name];
  if (env) return env;
  if (isEmulator) return null;
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  try {
    client ??= new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({ name: `projects/${projectId}/secrets/${name}/versions/latest` });
    const value = version.payload?.data ? Buffer.from(version.payload.data as Uint8Array).toString('utf8') : null;
    cache.set(name, { value, at: Date.now() });
    return value;
  } catch {
    cache.set(name, { value: null, at: Date.now() });
    return null;
  }
}
