// The administrator the suites sign in as. Start the server for them with the same pair:
//   NOTKA_ADMIN_USERNAME=admin NOTKA_ADMIN_PASSWORD=e2e-admin-password
// (or set E2E_ADMIN_LOGIN / E2E_ADMIN_PASSWORD to the ones it was first started with).
export const ADMIN = {
  login: process.env.E2E_ADMIN_LOGIN ?? 'admin',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password'
};

/**
 * Sign-up starts closed on a new instance, and the suites register their own accounts, so the first
 * thing each of them does is open it — as the administrator, through the same API the server
 * settings use.
 */
export async function openRegistration(baseUrl) {
  const signIn = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN)
  });
  if (!signIn.ok) {
    throw new Error(
      `Signing in as the administrator failed (${signIn.status}). Start the server with ` +
        'NOTKA_ADMIN_USERNAME=admin NOTKA_ADMIN_PASSWORD=e2e-admin-password, or set E2E_ADMIN_LOGIN/E2E_ADMIN_PASSWORD.'
    );
  }
  const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
  const opened = await fetch(`${baseUrl}/api/admin/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ registrationOpen: true })
  });
  if (!opened.ok) throw new Error(`Opening sign-up failed (${opened.status})`);
}
