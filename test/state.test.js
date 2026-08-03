import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  fingerprintMessage,
  loadState,
  saveState,
} from '../src/state.js';

test('fingerprints messages deterministically', () => {
  const message = {
    index: '1',
    from: '+123',
    subject: 'hello',
    received: 'now',
    messageType: '0',
  };
  assert.equal(fingerprintMessage(message), fingerprintMessage({ ...message }));
  assert.notEqual(
    fingerprintMessage(message),
    fingerprintMessage({ ...message, subject: 'different' }),
  );
});

test('persists state without SMS content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fm-u8-sms-'));
  const path = join(directory, 'state.json');
  try {
    assert.deepEqual(await loadState(path), {
      version: 1,
      seen: [],
      lastUnread: null,
    });
    await saveState(path, { seen: ['a', 'b'], lastUnread: 2 });
    assert.deepEqual(await loadState(path), {
      version: 1,
      seen: ['a', 'b'],
      lastUnread: 2,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
