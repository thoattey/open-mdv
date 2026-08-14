import { NextResponse } from 'next/server';

import { SESSION_COOKIE } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** POST /api/admin/logout — drop the session cookie. Safe to call unauthenticated. */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete({ name: SESSION_COOKIE, path: '/' });
  return response;
}
