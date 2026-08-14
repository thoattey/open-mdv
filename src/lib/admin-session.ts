import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './admin';

/**
 * Authentication for the /admin data-control console.
 *
 * One operator, credentials in the environment — there is no user table and no
 * registration flow, because the console exists to let the person running this
 * deployment censor records, not to be a multi-tenant product. The session is a
 * stateless HMAC-signed cookie: nothing to store server-side, and rotating
 * ADMIN_SESSION_SECRET invalidates every outstanding session at once.
 *
 * Checks run inside the route handlers and the page's server component rather
 * than in `proxy.ts`, per Next's guidance that proxy is for optimistic redirects
 * and not for authorization.
 */

export interface AdminConfig {
  username: string;
  password: string;
  secret: string;
}

/** Reads the operator credentials, or explains which variable is missing. */
export function adminConfig(): AdminConfig | { missing: string[] } {
  const username = process.env.ADMIN_USERNAME ?? '';
  const password = process.env.ADMIN_PASSWORD ?? '';
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  const missing = [
    ['ADMIN_USERNAME', username],
    ['ADMIN_PASSWORD', password],
    ['ADMIN_SESSION_SECRET', secret],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k as string);
  return missing.length ? { missing } : { username, password, secret };
}

/** Constant-time string equality. Digesting first keeps the buffers equal length,
 *  which `timingSafeEqual` requires and which stops it leaking the length. */
function sameSecret(a: string, b: string): boolean {
  const digest = (s: string) => createHmac('sha256', 'cmp').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** `<base64url payload>.<signature>`; the payload carries the operator and expiry. */
export function issueToken(config: AdminConfig): string {
  const body = JSON.stringify({
    u: config.username,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    jti: randomUUID(),
  });
  const payload = Buffer.from(body, 'utf8').toString('base64url');
  return `${payload}.${sign(payload, config.secret)}`;
}

export function verifyToken(token: string, config: AdminConfig): string | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload, config.secret);
  // Compare before parsing: an unsigned payload is never worth reading.
  if (signature.length !== expected.length || !sameSecret(signature, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      u?: string;
      exp?: number;
    };
    if (!claims.u || !claims.exp || claims.exp * 1000 < Date.now()) return null;
    // A username change in the environment retires sessions issued to the old one.
    if (!sameSecret(claims.u, config.username)) return null;
    return claims.u;
  } catch {
    return null;
  }
}

export function checkCredentials(username: string, password: string, config: AdminConfig): boolean {
  // Both halves are always compared, so a wrong username costs the same as a
  // wrong password and neither can be probed by timing.
  const okUser = sameSecret(username, config.username);
  const okPass = sameSecret(password, config.password);
  return okUser && okPass;
}

/** The signed-in operator for the current request, or null. */
export async function currentAdmin(): Promise<string | null> {
  const config = adminConfig();
  if ('missing' in config) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifyToken(token, config) : null;
}

/**
 * Guard for the admin route handlers. Returns the operator name, or a 401/503
 * response to hand straight back to the caller.
 */
export async function requireAdmin(): Promise<{ admin: string } | { response: Response }> {
  const config = adminConfig();
  if ('missing' in config) {
    return {
      response: Response.json(
        { error: `admin console is not configured: set ${config.missing.join(', ')}` },
        { status: 503 },
      ),
    };
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const admin = token ? verifyToken(token, config) : null;
  if (!admin) return { response: Response.json({ error: 'not authenticated' }, { status: 401 }) };
  return { admin };
}
