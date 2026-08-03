#!/usr/bin/env node

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { FmU8Client } from './client.js';
import { loadConfig } from './config.js';
import {
  fingerprintMessage,
  loadState,
  saveState,
} from './state.js';

function usage() {
  console.log(`fm-u8-sms

Usage:
  npm run status
  npm run list -- [--page N]
  npm run watch -- [--include-existing] [--once] [--output PATH]

Commands:
  status   Show device, network, and SMS counters.
  list     Read inbox messages. Reads all pages unless --page is supplied.
  watch    Poll for new messages and emit one JSON object per message.

Options:
  --page N             Read one inbox page.
  --include-existing   Emit existing messages when watch starts with empty state.
  --once               Run one watch reconciliation and exit.
  --output PATH        Append emitted messages as JSON Lines.
`);
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function createClient(config) {
  return new FmU8Client(config);
}

async function emitMessage(message, outputFile) {
  const line = `${JSON.stringify(message)}\n`;
  process.stdout.write(line);
  if (outputFile) {
    await mkdir(dirname(outputFile), { recursive: true });
    await appendFile(outputFile, line, { encoding: 'utf8', mode: 0o600 });
  }
}

async function runStatus(config) {
  const status = await createClient(config).getStatus();
  console.log(JSON.stringify(status, null, 2));
}

async function runList(config, args) {
  const client = createClient(config);
  const pageValue = readOption(args, '--page');
  if (pageValue) {
    const page = Number.parseInt(pageValue, 10);
    if (!Number.isInteger(page) || page < 1) {
      throw new Error('--page must be a positive integer.');
    }
    console.log(JSON.stringify(await client.listInboxPage(page), null, 2));
    return;
  }

  console.log(JSON.stringify(await client.listInbox(), null, 2));
}

async function runWatch(config, args) {
  const client = createClient(config);
  const includeExisting = args.includes('--include-existing');
  const once = args.includes('--once');
  const outputFile = readOption(args, '--output') || config.outputFile;
  const state = await loadState(config.stateFile);
  const seen = new Set(state.seen);
  let stopped = false;
  let nextReconcileAt = 0;

  const sleep = () =>
    new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));

  process.once('SIGINT', () => {
    stopped = true;
  });
  process.once('SIGTERM', () => {
    stopped = true;
  });

  const reconcile = async (initial = false) => {
    const inbox = await client.listInbox();
    const unseen = inbox.messages.filter(
      (message) => !seen.has(fingerprintMessage(message)),
    );

    if (initial && seen.size === 0 && !includeExisting) {
      for (const message of inbox.messages) {
        seen.add(fingerprintMessage(message));
      }
      console.error(
        `Seeded ${inbox.messages.length} existing message(s); waiting for new SMS.`,
      );
    } else {
      for (const message of [...unseen].reverse()) {
        await emitMessage(message, outputFile);
        seen.add(fingerprintMessage(message));
      }
      if (unseen.length > 0) {
        console.error(`Received ${unseen.length} new SMS message(s).`);
      }
    }

    state.seen = [...seen];
    await saveState(config.stateFile, state);
    nextReconcileAt = Date.now() + config.reconcileIntervalMs;
  };

  let initialStatus;
  while (!stopped && !initialStatus) {
    try {
      await reconcile(true);
      initialStatus = await client.getStatus();
    } catch (error) {
      if (once) throw error;
      console.error(
        `[${new Date().toISOString()}] ${error.message} Retrying in ` +
          `${config.pollIntervalMs} ms.`,
      );
      await sleep();
    }
  }
  if (!initialStatus) return;

  state.lastUnread = initialStatus.smsUnreadLong;
  await saveState(config.stateFile, state);
  console.error(
    `Watching ${initialStatus.deviceName || 'FM U8'} at ${config.baseUrl}; ` +
      `unread=${initialStatus.smsUnreadLong}, interval=${config.pollIntervalMs}ms.`,
  );

  if (once) return;

  while (!stopped) {
    await sleep();
    if (stopped) break;

    try {
      const status = await client.getStatus();
      const countChanged = status.smsUnreadLong !== state.lastUnread;
      state.lastUnread = status.smsUnreadLong;
      if (countChanged || Date.now() >= nextReconcileAt) {
        await reconcile(false);
      } else {
        await saveState(config.stateFile, state);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${error.message}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || ['help', '--help', '-h'].includes(command)) {
    usage();
    return;
  }

  const config = loadConfig();
  if (command === 'status') return runStatus(config);
  if (command === 'list') return runList(config, args.slice(1));
  if (command === 'watch') return runWatch(config, args.slice(1));
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
