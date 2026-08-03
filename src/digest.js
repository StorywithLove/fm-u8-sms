import { createHash, randomBytes } from 'node:crypto';

export function md5Hex(value) {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

export function parseDigestChallenge(header) {
  if (!header) {
    throw new Error('The device did not return a WWW-Authenticate challenge.');
  }

  const prefix = header.trim().split(/\s+/, 1)[0];
  const read = (name) => {
    const match = header.match(new RegExp(`${name}="([^"]*)"`, 'i'));
    return match?.[1];
  };

  const realm = read('realm');
  const nonce = read('nonce');
  const qop = read('qop');
  if (!prefix || !realm || !nonce || !qop) {
    throw new Error(`Unsupported digest challenge: ${header}`);
  }

  return { prefix, realm, nonce, qop };
}

export function formatNonceCount(value) {
  return Number(value).toString(16).padStart(8, '0');
}

export function createClientNonce() {
  return randomBytes(8).toString('hex');
}

export function buildDigestResponse({
  method,
  uri,
  username,
  password,
  realm,
  nonce,
  nonceCount,
  clientNonce,
  qop = 'auth',
}) {
  const ha1 = md5Hex(`${username}:${realm}:${password}`);
  const ha2 = md5Hex(`${method.toUpperCase()}:${uri}`);
  return md5Hex(
    `${ha1}:${nonce}:${formatNonceCount(nonceCount)}:${clientNonce}:${qop}:${ha2}`,
  );
}
