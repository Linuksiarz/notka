// Signing in through an identity provider, in a real browser and through the real server. The provider
// is `oidc-provider.mjs`, which this suite starts itself; the server only has to be told about it:
//
//   NOTKA_PUBLIC_URL=http://localhost:8091 NOTKA_OIDC_ISSUER=http://localhost:8092 \
//   NOTKA_OIDC_CLIENT_ID=notka NOTKA_OIDC_NAME=TestID ...
//
// node e2e/sso.mjs <url> [firefox]
import { chromium, firefox } from 'playwright';
import { ADMIN } from './admin.mjs';
import { startProvider } from './oidc-provider.mjs';

const BASE = process.argv[2] ?? 'http://localhost:8091';
const engine = process.argv[3] === 'firefox' ? firefox : chromium;
const providerPort = Number(process.env.E2E_OIDC_PORT ?? 8092);
const PASSPHRASE = 'a long encryption passphrase';
const run = Date.now();

let failures = 0;
function check(name, passed, detail = '') {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}${!passed && detail ? ` — ${detail}` : ''}`);
  if (!passed) failures += 1;
}

const provider = await startProvider(providerPort);
const browser = await engine.launch();

async function device(viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    localStorage.setItem('notka.locale', 'en-US');
    localStorage.setItem('notka.browserNotice', 'dismissed');
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  return page;
}

async function atProvider(page, who, action = 'Sign in') {
  await page.waitForURL(/\/authorize/);
  await page.fill('[name=sub]', who.sub);
  await page.fill('[name=email]', who.email);
  await page.fill('[name=name]', who.name);
  await page.getByRole('button', { name: action }).click();
}

async function signInThroughProvider(page, who, action) {
  await page.getByRole('button', { name: 'Sign in with TestID' }).click();
  await atProvider(page, who, action);
}

async function setRegistration(open) {
  const signIn = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN)
  });
  const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
  await fetch(`${BASE}/api/admin/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ registrationOpen: open })
  });
}

const openSettings = async (page) => {
  await page.goto(`${BASE}/settings`);
  await page.locator('h2', { hasText: 'Settings' }).waitFor();
};

try {
  const alice = { sub: `alice-${run}`, email: `alice-${run}@example.com`, name: 'Alice Provider' };

  // The sign-in screen, with sign-up closed.
  await setRegistration(false);
  const first = await device();
  await first.getByRole('button', { name: 'Sign in with TestID' }).waitFor();
  check('the sign-in screen offers the provider next to the password', await first.locator('input[type=password]').isVisible());

  await signInThroughProvider(first, alice);
  await first.getByText('Registration is disabled').waitFor();
  await first.waitForURL('**/login');
  check('a new person is turned away while sign-up is closed', !first.url().includes('ssoError'), first.url());

  await signInThroughProvider(first, alice, 'Deny');
  await first.getByText('refused the sign-in').waitFor();
  check('a refusal at the provider says so', !first.url().includes('ssoError'), first.url());

  // Sign-up open: the person becomes an account.
  await setRegistration(true);
  await signInThroughProvider(first, alice);
  await first.getByText('Take a note').first().waitFor();
  const me = await first.evaluate(() => fetch('/api/auth/me').then((response) => response.json()));
  check('a new subject becomes an account without a password', me.user.email === alice.email && me.user.hasPassword === false && me.user.ssoLinked === true);
  const cookies = await first.context().cookies();
  const session = cookies.find((cookie) => cookie.name === 'notka_session');
  check('the session cookie keeps its rules', session?.httpOnly === true && session?.sameSite === 'Lax');
  check('the attempt cookie is gone', !cookies.some((cookie) => cookie.name.includes('notka_sso')));

  // Encryption with a passphrase.
  await openSettings(first);
  check('an account without a password has no password section', !(await first.getByText('Change password').isVisible()));
  await first.getByLabel('Encrypt my private notes').click();
  await first.getByLabel('Encryption passphrase', { exact: true }).fill(PASSPHRASE);
  await first.getByLabel('Passphrase again').fill(PASSPHRASE);
  await first.getByRole('button', { name: 'Turn on' }).click();
  const recoveryKey = await first.getByTestId('recovery-key').textContent();
  check('turning encryption on gives the recovery key', recoveryKey?.length === 39, recoveryKey ?? '');
  await first.getByRole('button', { name: 'I wrote it down' }).click();
  const created = await first.evaluate(() =>
    fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Sealed note' }) }).then((response) => response.json())
  );
  check('a note of that account is stored encrypted', created.encryption === 'ENCRYPTED', created.encryption);

  // Another device: the provider alone does not open the notes.
  const second = await device();
  await signInThroughProvider(second, alice);
  await second.getByRole('heading', { name: 'Open your notes' }).waitFor();
  const refused = await second.evaluate(() => fetch('/api/notes').then((response) => response.status));
  check('a new device stays locked while the first still has the key in memory', refused === 403, String(refused));
  check('the locked device shows no notes', (await second.getByText('Sealed note').count()) === 0);
  await second.getByLabel('Encryption passphrase').fill('not the passphrase');
  await second.getByRole('button', { name: 'Open notes' }).click();
  await second.getByText('does not open your notes').waitFor();
  check('a wrong passphrase is refused', true);
  await second.getByLabel('Encryption passphrase').fill(PASSPHRASE);
  await second.getByRole('button', { name: 'Open notes' }).click();
  await second.getByText('Sealed note').waitFor();
  check('the passphrase opens the notes on that device', true);
  await second.reload();
  await second.getByText('Sealed note').waitFor();
  check('it is asked for once: a reload stays open', !(await second.getByRole('heading', { name: 'Open your notes' }).isVisible()));

  // Forgotten: the recovery key.
  const third = await device({ width: 412, height: 893 });
  await signInThroughProvider(third, alice);
  await third.getByRole('heading', { name: 'Open your notes' }).waitFor();
  const overflow = await third.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('the unlock screen fits a phone', !overflow);
  await third.getByRole('button', { name: 'I forgot it' }).click();
  await third.getByLabel('Recovery key').fill(recoveryKey);
  await third.getByLabel('New encryption passphrase').fill('a brand new passphrase');
  await third.getByLabel('New passphrase again').fill('a brand new passphrase');
  await third.getByRole('button', { name: 'Use recovery key' }).click();
  await third.getByText('Sealed note').waitFor();
  check('the recovery key opens the notes and sets a new passphrase', true);

  // An account with a password connects from inside, by subject and not by address.
  const bob = { email: `bob-${run}@example.com`, name: 'Bob Password', password: 'bob password here' };
  const bobPage = await device();
  await bobPage.evaluate((details) =>
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: details.email, displayName: details.name, password: details.password })
    }), bob);

  const squatter = await device();
  await signInThroughProvider(squatter, { sub: `mallory-${run}`, email: bob.email, name: 'Mallory' });
  await squatter.getByText('already exists').waitFor();
  await squatter.waitForURL('**/login');
  check('an address that is taken never links to that account', true);

  await openSettings(bobPage);
  await bobPage.getByRole('button', { name: 'Connect to TestID' }).click();
  await atProvider(bobPage, { sub: `bob-${run}`, email: `other-${run}@example.com`, name: 'Bob at provider' });
  await bobPage.getByText('Account connected').waitFor();
  check('a password account connects from Settings', !bobPage.url().includes('sso='), bobPage.url());

  const bobElsewhere = await device();
  await signInThroughProvider(bobElsewhere, { sub: `bob-${run}`, email: `other-${run}@example.com`, name: 'Bob at provider' });
  await bobElsewhere.getByText('Take a note').first().waitFor();
  const bobMe = await bobElsewhere.evaluate(() => fetch('/api/auth/me').then((response) => response.json()));
  check('and comes back to the same account by subject', bobMe.user.email === bob.email, bobMe.user.email);
} finally {
  await browser.close();
  provider.close();
  await setRegistration(true);
}

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All SSO checks passed');
