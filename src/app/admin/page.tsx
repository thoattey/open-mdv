import { AdminConsole } from '@/components/admin/console';
import { LoginForm } from '@/components/admin/login-form';
import { adminConfig, currentAdmin } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

/**
 * /admin — the data control console.
 *
 * The gate is server-side: the console component is never sent to an
 * unauthenticated browser, and the API it drives re-checks the session on every
 * request, so hiding the UI is a convenience rather than the control itself.
 */
export default async function AdminPage() {
  const config = adminConfig();
  const admin = 'missing' in config ? null : await currentAdmin();

  return (
    <main className="mx mx-crt flex min-h-dvh w-full flex-col">
      {admin ? (
        <AdminConsole admin={admin} />
      ) : (
        <LoginForm missing={'missing' in config ? config.missing : []} />
      )}
    </main>
  );
}
