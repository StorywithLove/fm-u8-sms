import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDigestResponse,
  formatNonceCount,
  md5Hex,
  parseDigestChallenge,
} from '../src/digest.js';

test('parses the FM U8 digest challenge', () => {
  assert.deepEqual(
    parseDigestChallenge(
      'Digest realm="Highwmg", nonce="327971", qop="auth"',
    ),
    {
      prefix: 'Digest',
      realm: 'Highwmg',
      nonce: '327971',
      qop: 'auth',
    },
  );
});

test('builds the RFC 2617 digest response', () => {
  assert.equal(
    buildDigestResponse({
      method: 'GET',
      uri: '/dir/index.html',
      username: 'Mufasa',
      password: 'Circle Of Life',
      realm: 'testrealm@host.com',
      nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
      nonceCount: 1,
      clientNonce: '0a4f113b',
      qop: 'auth',
    }),
    '6629fae49393a05397450978507c4ef1',
  );
});

test('formats hashes and nonce counts', () => {
  assert.equal(md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(formatNonceCount(16), '00000010');
});
