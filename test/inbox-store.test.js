import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InboxStore } from '../src/inbox-store.js';

const sample = {
  index: 'LRCV1',
  from: '10010',
  subject: 'test message',
  received: '26,08,03,14,00,00,+8',
  receivedAt: '2026-08-03T06:00:00.000Z',
  status: '0',
  messageType: '0',
  classType: '0',
};

test('stores, deduplicates, and marks local messages as read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fm-u8-inbox-'));
  const path = join(directory, 'inbox.json');
  try {
    const store = new InboxStore(path);
    await store.load();
    assert.deepEqual(store.summary(), { total: 0, unread: 0 });

    const added = await store.merge([sample], '2026-08-03T06:01:00.000Z');
    assert.equal(added.length, 1);
    assert.deepEqual(store.summary(), { total: 1, unread: 1 });
    assert.equal((await store.merge([sample])).length, 0);

    const id = store.list()[0].id;
    assert.equal(await store.markRead(id, '2026-08-03T06:02:00.000Z'), true);
    assert.deepEqual(store.summary(), { total: 1, unread: 0 });

    const reloaded = new InboxStore(path);
    await reloaded.load();
    assert.equal(reloaded.list()[0].readAt, '2026-08-03T06:02:00.000Z');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
