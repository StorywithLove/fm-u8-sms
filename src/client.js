import {
  buildDigestResponse,
  createClientNonce,
  formatNonceCount,
  parseDigestChallenge,
} from './digest.js';
import { buildInboxRequestXml, parseMessagesXml, parseStatusXml } from './xml.js';

const LOGIN_DIGEST_URI = '/cgi/protected.cgi';
const API_DIGEST_URI = '/cgi/xml_action.cgi';

export class FmU8Client {
  constructor({ baseUrl, username, password, timeoutMs = 10_000 }) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.session = null;
    this.nonceCount = 0;
  }

  async login() {
    const challengeResponse = await this.#fetch('/login.cgi');
    const challenge = parseDigestChallenge(
      challengeResponse.headers.get('www-authenticate'),
    );

    this.session = challenge;
    this.nonceCount = 1;
    const clientNonce = createClientNonce();
    const response = buildDigestResponse({
      method: 'GET',
      uri: LOGIN_DIGEST_URI,
      username: this.username,
      password: this.password,
      realm: challenge.realm,
      nonce: challenge.nonce,
      nonceCount: this.nonceCount,
      clientNonce,
      qop: challenge.qop,
    });

    const query = new URLSearchParams({
      Action: challenge.prefix,
      userName: this.username,
      realm: challenge.realm,
      nonce: challenge.nonce,
      response,
      qop: challenge.qop,
      cnonce: clientNonce,
      temp: 'asr',
    });
    const loginResponse = await this.#fetch(`/login.cgi?${query}`);
    if (!loginResponse.ok) {
      this.session = null;
      throw new Error(
        `U8 login failed with HTTP ${loginResponse.status}. Check the device password.`,
      );
    }
  }

  async getStatus() {
    const xml = await this.#authenticatedRequest(
      '/xml_action.cgi?method=get&module=duster&file=status1',
    );
    return parseStatusXml(xml);
  }

  async listInboxPage(page = 1) {
    const xml = await this.#authenticatedRequest(
      '/xml_action.cgi?method=set&module=duster&file=message',
      {
        method: 'POST',
        body: buildInboxRequestXml(page),
      },
    );
    return parseMessagesXml(xml);
  }

  async listInbox({ maxPages = 100 } = {}) {
    const first = await this.listInboxPage(1);
    const totalPages = Math.min(first.totalPages, maxPages);
    const messages = [...first.messages];

    for (let page = 2; page <= totalPages; page += 1) {
      const result = await this.listInboxPage(page);
      messages.push(...result.messages);
    }

    return {
      totalPages: first.totalPages,
      truncated: first.totalPages > maxPages,
      messages,
    };
  }

  async #authenticatedRequest(path, options = {}, canRetry = true) {
    if (!this.session) {
      await this.login();
    }

    const method = (options.method ?? 'GET').toUpperCase();
    this.nonceCount += 1;
    const clientNonce = createClientNonce();
    const nonceCount = this.nonceCount;
    const response = buildDigestResponse({
      method,
      uri: API_DIGEST_URI,
      username: this.username,
      password: this.password,
      realm: this.session.realm,
      nonce: this.session.nonce,
      nonceCount,
      clientNonce,
      qop: this.session.qop,
    });
    const authorization =
      `${this.session.prefix} username="${this.username}", ` +
      `realm="${this.session.realm}", nonce="${this.session.nonce}", ` +
      `uri="${API_DIGEST_URI}", response="${response}", ` +
      `qop=${this.session.qop}, nc=${formatNonceCount(nonceCount)}, ` +
      `cnonce="${clientNonce}"`;

    const headers = {
      Authorization: authorization,
      Expires: '-1',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers ?? {}),
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/xml';
    }

    const result = await this.#fetch(path, { ...options, method, headers });
    const text = await result.text();
    const unauthorized =
      result.status === 401 ||
      result.headers.has('www-authenticate') ||
      text.includes('UNAUTHORIZED') ||
      text.includes('KICKOFF');

    if (unauthorized && canRetry) {
      this.session = null;
      await this.login();
      return this.#authenticatedRequest(path, options, false);
    }
    if (unauthorized) {
      throw new Error('The U8 rejected the authenticated API request.');
    }
    if (!result.ok) {
      throw new Error(`U8 API request failed with HTTP ${result.status}.`);
    }
    if (!text.includes('<RGW>')) {
      throw new Error('The U8 returned an unexpected non-XML response.');
    }
    return text;
  }

  async #fetch(path, options = {}) {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new Error(`U8 request timed out after ${this.timeoutMs} ms.`);
      }
      throw new Error(`Cannot reach U8 at ${this.baseUrl}: ${error.message}`);
    }
  }
}
