import { NextResponse } from 'next/server';

import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/admin';
import { adminConfig, checkCredentials, issueToken } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/login — exchange the operator credentials from the
 * environment for a signed session cookie. See src/lib/admin-session.ts for why
 * there is exactly one operator and no user table.
 */

export async function POST(request: Request) {
  const config = adminConfig();
  if ('missing' in config) {
    return NextResponse.json(
      { error: `admin console is not configured: set ${config.missing.join(', ')} in .env.local` },
      { status: 503 },
    );
  }

  let username = '';
  let password = '';
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    username = typeof body.username === 'string' ? body.username : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return NextResponse.json({ error: 'malformed request' }, { status: 400 });
  }

  if (!checkCredentials(username, password, config)) {
    // Deliberately vague: which half was wrong is not the caller's business.
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, admin: config.username });
  response.cookies.set(SESSION_COOKIE, issueToken(config), {
    httpOnly: true,
    sameSite: 'lax',
    // Plain HTTP is the norm for `next dev`; a Secure cookie would never be
    // sent back there, so the flag follows the deployment.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
