import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { FmU8Client } from '../src/client.js';

test('starts authenticated API nonce counting at one after login', async (t) => {
  const authorizationHeaders = [];
  let loginRequests = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    if (url.pathname === '/login.cgi' && !url.search) {
      loginRequests += 1;
      response.writeHead(401, {
        'WWW-Authenticate': 'Digest realm="Highwmg", nonce="327971", qop="auth"',
      });
      response.end();
      return;
    }

    if (url.pathname === '/login.cgi') {
      assert.equal(url.searchParams.get('Action'), 'Digest');
      assert.equal(url.searchParams.get('userName'), 'admin');
      assert.equal(url.searchParams.get('temp'), 'asr');
      response.writeHead(200);
      response.end('OK');
      return;
    }

    if (url.pathname === '/xml_action.cgi') {
      authorizationHeaders.push(request.headers.authorization);
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end('<RGW><sysinfo><device_name>FM_U8</device_name></sysinfo></RGW>');
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const client = new FmU8Client({
    baseUrl: `http://127.0.0.1:${address.port}`,
    username: 'admin',
    password: 'test-only-password',
  });

  await client.getStatus();
  await client.getStatus();

  assert.equal(loginRequests, 1);
  assert.match(authorizationHeaders[0], /\bnc=00000001\b/);
  assert.match(authorizationHeaders[1], /\bnc=00000002\b/);
});
