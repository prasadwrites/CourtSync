/**
 * Wraps onCall with input validation, authentication, App Check and rate limiting,
 * so every handler receives parsed data and a known caller.
 */
import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { ZodType, ZodTypeDef } from 'zod';
import { fail, zodToHttps } from './errors';
import { HttpsError } from 'firebase-functions/v2/https';
import { checkRateLimit } from './rateLimit';
import { isEmulator } from './firebase';

export interface Caller {
  uid: string;
  email: string | null;
  superAdmin: boolean;
  token: Record<string, unknown>;
}

export interface CallableOptions {
  /** Allow calls without a signed-in user (public calendar). */
  allowAnonymous?: boolean;
  /** Requests per minute per caller for this function. */
  rateLimit?: number;
  timeoutSeconds?: number;
  memory?: '256MiB' | '512MiB' | '1GiB';
}

const enforceAppCheck = !isEmulator && process.env.ENFORCE_APP_CHECK === 'true';

export function callable<I, O>(
  name: string,
  schema: ZodType<I, ZodTypeDef, unknown>,
  handler: (data: I, caller: Caller, req: CallableRequest<unknown>) => Promise<O>,
  opts: CallableOptions = {},
) {
  return onCall(
    { enforceAppCheck, timeoutSeconds: opts.timeoutSeconds ?? 60, memory: opts.memory ?? '256MiB', cors: true },
    async (req) => {
      const authInfo = req.auth;
      if (!authInfo && !opts.allowAnonymous) throw fail.unauthenticated();
      const parsed = schema.safeParse(req.data ?? {});
      if (!parsed.success) throw zodToHttps(parsed.error);
      const caller: Caller = authInfo
        ? {
            uid: authInfo.uid,
            email: (authInfo.token.email as string | undefined) ?? null,
            superAdmin: authInfo.token.superAdmin === true,
            token: authInfo.token as unknown as Record<string, unknown>,
          }
        : { uid: '', email: null, superAdmin: false, token: {} };
      const limitKey = caller.uid || req.rawRequest?.ip || 'anon';
      await checkRateLimit(name, limitKey, opts.rateLimit ?? 60);
      try {
        return await handler(parsed.data, caller, req);
      } catch (err) {
        if (err instanceof HttpsError) throw err;
        logger.error(`${name} failed`, err);
        throw fail.internal();
      }
    },
  );
}
