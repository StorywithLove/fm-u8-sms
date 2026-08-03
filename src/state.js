import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const MAX_SEEN_MESSAGES = 2_000;

export function fingerprintMessage(message) {
  const canonical = [
    message.index,
    message.from,
    message.subject,
    message.received,
    message.messageType,
  ].join('\u0000');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return {
      version: 1,
      seen: Array.isArray(parsed.seen)
        ? parsed.seen.filter((value) => typeof value === 'string').slice(-MAX_SEEN_MESSAGES)
        : [],
      lastUnread: Number.isInteger(parsed.lastUnread) ? parsed.lastUnread : null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: 1, seen: [], lastUnread: null };
    }
    throw new Error(`Cannot read state file ${path}: ${error.message}`);
  }
}

export async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  const value = {
    version: 1,
    seen: [...new Set(state.seen)].slice(-MAX_SEEN_MESSAGES),
    lastUnread: state.lastUnread,
  };
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(tempPath, path);
}
