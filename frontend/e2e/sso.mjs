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

async function setRegistration(open, ssoOnly = false) {
  const signIn = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN)
  });
  const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
  await fetch(`${BASE}/api/admin/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ registrationOpen: open, registrationSsoOnly: ssoOnly })
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
  check('and takes the name the provider gives', bobMe.user.displayName === 'Bob at provider', bobMe.user.displayName);

  // The provider's name and picture: a JPEG stays that JPEG, anything else goes through the pixels.
  const canvasPicture = (page, type) =>
    page.evaluate(async (mime) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: 300, height: 200 });
      const context = canvas.getContext('2d');
      context.fillStyle = '#c33';
      context.fillRect(0, 0, 300, 200);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }, type);
  const storedAvatar = (page) =>
    page.evaluate(async () => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const { user } = await fetch('/api/auth/me').then((response) => response.json());
        if (user.avatarAt) {
          const bytes = await fetch(`/api/users/${user.id}/avatar?v=${user.avatarAt}`).then((response) => response.arrayBuffer());
          return { at: user.avatarAt, text: String.fromCharCode(...new Uint8Array(bytes)) };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return null;
    });

  const carol = { sub: `carol-${run}`, email: `carol-${run}@example.com`, name: 'Carol Provider' };
  const carolPage = await device();
  provider.picture = Buffer.from(await canvasPicture(carolPage, 'image/jpeg'));
  await signInThroughProvider(carolPage, carol);
  await carolPage.getByText('Take a note').first().waitFor();
  const fromJpeg = await storedAvatar(carolPage);
  check('a JPEG from the provider is stored as JPEG XL that can rebuild it', fromJpeg?.text.includes('jbrd') === true);

  const dana = { sub: `dana-${run}`, email: `dana-${run}@example.com`, name: 'Dana Provider' };
  const danaPage = await device();
  provider.picture = Buffer.from(await canvasPicture(danaPage, 'image/png'));
  await signInThroughProvider(danaPage, dana);
  await danaPage.getByText('Take a note').first().waitFor();
  const fromPng = await storedAvatar(danaPage);
  check('a PNG from the provider is encoded from its pixels', fromPng !== null && !fromPng.text.includes('jbrd'));

  await openSettings(carolPage);
  check('the name is locked in Settings', await carolPage.getByLabel('Display name').isDisabled());
  check('Settings says who manages it', (await carolPage.getByTestId('profile-managed').textContent())?.includes('TestID') === true);
  check('Settings offers no picture to change', !(await carolPage.getByRole('button', { name: 'Change picture' }).isVisible()));
  await carolPage.goto(`${BASE}/`);
  await carolPage.getByRole('button', { name: 'Account' }).click();
  await carolPage.getByRole('menuitem', { name: 'Change profile picture' }).click();
  const pictureDialog = carolPage.getByTestId('avatar-dialog');
  check('the picture dialog says who manages it and offers nothing to choose',
    (await carolPage.getByTestId('avatar-hint').textContent())?.includes('TestID') === true &&
      (await pictureDialog.getByRole('button', { name: 'Choose a picture' }).count()) === 0 &&
      (await pictureDialog.getByRole('button', { name: 'Remove picture' }).count()) === 0);
  const refusedRename = await carolPage.evaluate(() =>
    fetch('/api/auth/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Mine' }) }).then((response) => response.status)
  );
  check('the server refuses a new name too', refusedRename === 403, String(refusedRename));

  const carolAgain = await device({ width: 412, height: 893 });
  await signInThroughProvider(carolAgain, { ...carol, name: 'Carol Renamed' });
  await carolAgain.waitForURL(`${BASE}/`);
  const newest = await carolAgain.evaluate(async (before) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { user } = await fetch('/api/auth/me').then((response) => response.json());
      if (user.avatarAt !== before) return user;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }, fromJpeg?.at);
  check('the next sign-in brings the name and the picture again', newest?.displayName === 'Carol Renamed', newest?.displayName);
  await openSettings(carolAgain);
  check('the locked profile fits a phone', await carolAgain.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  // Signing out ends at the provider, with the device already cleared.
  const accountMenu = async (page, item) => {
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: item, exact: true }).click();
  };
  // What is left of the account here. `themes` is the instance's own: the sign-in screen stores it again.
  const accountCopies = (page) =>
    page.goto(`${BASE}/login`).then(() =>
      page.evaluate(async () => {
        const database = await new Promise((resolve, reject) => {
          const open = indexedDB.open('notka');
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        const keys = await new Promise((resolve) => {
          const all = database.transaction('local').objectStore('local').getAllKeys();
          all.onsuccess = () => resolve(all.result);
        });
        database.close();
        return keys.filter((key) => key !== 'themes');
      }));
  const providerCookie = async (page) => (await page.context().cookies(`${BASE}/api/auth/logout`)).find((cookie) => cookie.name === 'notka_id_token');

  const frank = { sub: `frank-${run}`, email: `frank-${run}@example.com`, name: 'Frank Provider' };
  const frankPage = await device();
  await signInThroughProvider(frankPage, frank);
  await frankPage.getByText('Take a note').first().waitFor();
  const frankCookie = await providerCookie(frankPage);
  check('the ID token is kept out of the page and off the other routes', frankCookie?.httpOnly === true && frankCookie?.path === '/api/auth', JSON.stringify(frankCookie?.path));
  const before = provider.endedSessions ?? 0;
  await accountMenu(frankPage, 'Sign out');
  await frankPage.getByRole('heading', { name: 'Sign in to the provider' }).waitFor();
  check('signing out ends on the provider\'s sign-in screen', frankPage.url() === `http://localhost:${providerPort}/login`, frankPage.url());
  check('the provider got a valid hint and chose the address itself', provider.endedSessions === before + 1);
  const left = await accountCopies(frankPage);
  check('the device keeps nothing of the account', left.length === 0, JSON.stringify(left));
  await frankPage.getByRole('button', { name: 'Sign in with TestID' }).waitFor();
  check('Notka is signed out when the reader comes back', (await frankPage.evaluate(() => fetch('/api/auth/me').then((response) => response.status))) === 401);
  check('nor is the ID token left behind', (await providerCookie(frankPage)) === undefined);

  await signInThroughProvider(frankPage, frank);
  await frankPage.getByText('Take a note').first().waitFor();
  const frankPhone = await device({ width: 412, height: 893 });
  await signInThroughProvider(frankPhone, frank);
  await frankPhone.waitForURL(`${BASE}/`);
  await accountMenu(frankPage, 'Sign out of all devices');
  await frankPage.getByRole('heading', { name: 'Sign in to the provider' }).waitFor();
  check('signing out of all devices ends here at the provider too', provider.endedSessions === before + 2);
  check('and ends the other device\'s session', (await frankPhone.evaluate(() => fetch('/api/auth/me').then((response) => response.status))) === 401);

  const lockedPage = await device();
  await signInThroughProvider(lockedPage, alice);
  await lockedPage.getByRole('heading', { name: 'Open your notes' }).waitFor();
  await lockedPage.getByRole('button', { name: 'Sign out' }).click();
  await lockedPage.getByRole('heading', { name: 'Sign in to the provider' }).waitFor();
  check('a locked device signs out at the provider too', true);

  const gina = { email: `gina-${run}@example.com`, password: 'gina password here' };
  const ginaPage = await device();
  await ginaPage.evaluate((details) =>
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: details.email, displayName: 'Gina Password', password: details.password })
    }), gina);
  await ginaPage.goto(`${BASE}/`);
  const ended = provider.endedSessions;
  await accountMenu(ginaPage, 'Sign out');
  await ginaPage.waitForURL('**/login');
  check('a password session stays on Notka\'s own sign-in screen', provider.endedSessions === ended && ginaPage.url().startsWith(BASE), ginaPage.url());

  // Sign-up only through the provider.
  await setRegistration(true, true);
  const erinPage = await device();
  await erinPage.getByRole('button', { name: 'Sign in with TestID' }).waitFor();
  check('the sign-in screen offers no password sign-up', (await erinPage.getByRole('button', { name: 'Create an account' }).count()) === 0);
  const refusedSignUp = await erinPage.evaluate((run) =>
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `erin-${run}@example.com`, displayName: 'Erin', password: 'erin password here' })
    }).then((response) => response.status), run);
  check('the server refuses a password sign-up', refusedSignUp === 403, String(refusedSignUp));
  await signInThroughProvider(erinPage, { sub: `erin-${run}`, email: `erin-${run}@example.com`, name: 'Erin Provider' });
  await erinPage.getByText('Take a note').first().waitFor();
  check('the provider still creates an account', true);
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
