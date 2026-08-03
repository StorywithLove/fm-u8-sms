import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fingerprintMessage } from './state.js';

const STORE_VERSION = 1;
const MAX_MESSAGES = 5_000;

function normalizeStoredMessage(message) {
  return {
    id: String(message.id),
    index: String(message.index ?? ''),
    from: String(message.from ?? ''),
    subject: String(message.subject ?? ''),
    received: String(message.received ?? ''),
    receivedAt: message.receivedAt || null,
    status: String(message.status ?? ''),
    messageType: String(message.messageType ?? ''),
    classType: String(message.classType ?? ''),
    firstSeenAt: message.firstSeenAt || new Date().toISOString(),
    readAt: message.readAt || null,
  };
}

export class InboxStore {
  constructor(path) {
    this.path = path;
    this.messages = [];
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      this.messages = Array.isArray(parsed.messages)
        ? parsed.messages.map(normalizeStoredMessage).slice(0, MAX_MESSAGES)
        : [];
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Cannot read inbox file ${this.path}: ${error.message}`);
      }
      this.messages = [];
    }
    this.loaded = true;
  }

  list() {
    this.#assertLoaded();
    return [...this.messages].sort((left, right) => {
      const leftTime = left.receivedAt || left.firstSeenAt;
      const rightTime = right.receivedAt || right.firstSeenAt;
      return rightTime.localeCompare(leftTime);
    });
  }

  summary() {
    this.#assertLoaded();
    return {
      total: this.messages.length,
      unread: this.messages.filter((message) => !message.readAt).length,
    };
  }

  async merge(incomingMessages, now = new Date().toISOString()) {
    this.#assertLoaded();
    const byId = new Map(this.messages.map((message) => [message.id, message]));
    const added = [];

    for (const incoming of incomingMessages) {
      const id = fingerprintMessage(incoming);
      const existing = byId.get(id);
      if (existing) {
        Object.assign(existing, {
          index: incoming.index,
          from: incoming.from,
          subject: incoming.subject,
          received: incoming.received,
          receivedAt: incoming.receivedAt || existing.receivedAt,
          status: incoming.status,
          messageType: incoming.messageType,
          classType: incoming.classType,
        });
        continue;
      }

      const message = normalizeStoredMessage({
        ...incoming,
        id,
        firstSeenAt: now,
        readAt: null,
      });
      this.messages.push(message);
      byId.set(id, message);
      added.push(message);
    }

    if (this.messages.length > MAX_MESSAGES) {
      this.messages = this.list().slice(0, MAX_MESSAGES);
    }
    if (added.length > 0) await this.save();
    return added;
  }

  async markRead(id, now = new Date().toISOString()) {
    this.#assertLoaded();
    const message = this.messages.find((item) => item.id === id);
    if (!message) return false;
    if (!message.readAt) {
      message.readAt = now;
      await this.save();
    }
    return true;
  }

  async markAllRead(now = new Date().toISOString()) {
    this.#assertLoaded();
    let changed = 0;
    for (const message of this.messages) {
      if (!message.readAt) {
        message.readAt = now;
        changed += 1;
      }
    }
    if (changed > 0) await this.save();
    return changed;
  }

  async save() {
    this.#assertLoaded();
    await mkdir(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.${process.pid}.tmp`;
    const value = {
      version: STORE_VERSION,
      messages: this.list(),
    };
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(tempPath, this.path);
  }

  #assertLoaded() {
    if (!this.loaded) throw new Error('InboxStore.load() must be called first.');
  }
}
