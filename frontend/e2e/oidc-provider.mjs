import { createHash, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

/**
 * A small OpenID Connect provider for `sso.mjs`: discovery, a page to sign in on, a token endpoint that
 * enforces PKCE, an RS256 ID token and a JWK set. Whoever signs in is whatever the page's form says,
 * so a suite can be two people, or the same person on two devices.
 */
export function startProvider(port, clientId = 'notka') {
  const issuer = `http://localhost:${port}`;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  // A key id of its own per start: a server that outlives this provider caches keys by their id.
  const kid = randomUUID();
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const grants = new Map();

  const base64url = (value) => Buffer.from(value).toString('base64url');
  const idToken = (claims) => {
    const body = `${base64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
    return `${body}.${createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url')}`;
  };
  const json = (response, status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  const read = async (request) => {
    let text = '';
    for await (const chunk of request) text += chunk;
    return new URLSearchParams(text);
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, issuer);
    if (url.pathname === '/.well-known/openid-configuration') {
      return json(response, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256']
      });
    }
    if (url.pathname === '/jwks') return json(response, 200, { keys: [jwk] });
    if (url.pathname === '/authorize' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      return response.end(`<!doctype html><title>Provider</title>
        <form method="post"><input type="hidden" name="query" value="${url.search.slice(1).replaceAll('"', '&quot;')}">
        <input name="sub" placeholder="subject"><input name="email" placeholder="email"><input name="name" placeholder="name">
        <button>Sign in</button><button name="deny" value="1">Deny</button></form>`);
    }
    if (url.pathname === '/authorize') {
      const form = await read(request);
      const query = new URLSearchParams(form.get('query'));
      const back = new URL(query.get('redirect_uri'));
      back.searchParams.set('state', query.get('state'));
      if (form.get('deny')) {
        back.searchParams.set('error', 'access_denied');
      } else {
        const code = randomUUID();
        grants.set(code, { query, sub: form.get('sub'), email: form.get('email'), name: form.get('name') });
        back.searchParams.set('code', code);
      }
      response.writeHead(302, { Location: back.toString() });
      return response.end();
    }
    if (url.pathname === '/token') {
      const form = await read(request);
      const grant = grants.get(form.get('code'));
      grants.delete(form.get('code'));
      const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
      if (!grant || challenge !== grant.query.get('code_challenge') || form.get('redirect_uri') !== grant.query.get('redirect_uri')) {
        return json(response, 400, { error: 'invalid_grant' });
      }
      const now = Math.floor(Date.now() / 1000);
      return json(response, 200, {
        access_token: randomUUID(),
        token_type: 'Bearer',
        expires_in: 60,
        id_token: idToken({
          iss: issuer,
          aud: clientId,
          sub: grant.sub,
          email: grant.email,
          name: grant.name,
          nonce: grant.query.get('nonce'),
          iat: now,
          exp: now + 60
        })
      });
    }
    response.writeHead(404);
    response.end();
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
