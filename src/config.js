import { resolve } from 'node:path';

function positiveInteger(value, fallback, name) {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function loadConfig(env = process.env, cwd = process.cwd()) {
  const password = env.FM_U8_PASSWORD;
  if (!password) {
    throw new Error(
      'FM_U8_PASSWORD is required. Copy .env.example to .env and set the device password.',
    );
  }

  const baseUrl = env.FM_U8_BASE_URL || 'http://192.168.0.1';
  const parsedUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('FM_U8_BASE_URL must use HTTP or HTTPS.');
  }

  return {
    baseUrl: parsedUrl.toString().replace(/\/$/, ''),
    username: env.FM_U8_USERNAME || 'admin',
    password,
    timeoutMs: positiveInteger(env.FM_U8_TIMEOUT_MS, 10_000, 'FM_U8_TIMEOUT_MS'),
    pollIntervalMs: positiveInteger(
      env.FM_U8_POLL_INTERVAL_MS,
      15_000,
      'FM_U8_POLL_INTERVAL_MS',
    ),
    reconcileIntervalMs: positiveInteger(
      env.FM_U8_RECONCILE_INTERVAL_MS,
      600_000,
      'FM_U8_RECONCILE_INTERVAL_MS',
    ),
    stateFile: resolve(cwd, env.FM_U8_STATE_FILE || './data/state.json'),
    outputFile: env.FM_U8_OUTPUT_FILE
      ? resolve(cwd, env.FM_U8_OUTPUT_FILE)
      : null,
    webHost: env.FM_U8_WEB_HOST || '127.0.0.1',
    webPort: positiveInteger(env.FM_U8_WEB_PORT, 8_788, 'FM_U8_WEB_PORT'),
    inboxFile: resolve(cwd, env.FM_U8_INBOX_FILE || './data/inbox.json'),
  };
}
