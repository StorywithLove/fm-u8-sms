const elements = {
  connectionPill: document.querySelector('#connection-pill'),
  connectionLabel: document.querySelector('#connection-label'),
  errorBanner: document.querySelector('#error-banner'),
  unreadCount: document.querySelector('#unread-count'),
  totalCount: document.querySelector('#total-count'),
  deviceUnreadCount: document.querySelector('#device-unread-count'),
  networkName: document.querySelector('#network-name'),
  deviceName: document.querySelector('#device-name'),
  chipName: document.querySelector('#chip-name'),
  lastSync: document.querySelector('#last-sync'),
  syncButton: document.querySelector('#sync-button'),
  readAllButton: document.querySelector('#read-all-button'),
  searchInput: document.querySelector('#search-input'),
  messageList: document.querySelector('#message-list'),
  emptyState: document.querySelector('#empty-state'),
  messageTemplate: document.querySelector('#message-template'),
  dialog: document.querySelector('#message-dialog'),
  dialogSender: document.querySelector('#dialog-sender'),
  dialogTime: document.querySelector('#dialog-time'),
  dialogContent: document.querySelector('#dialog-content'),
  dialogClose: document.querySelector('#dialog-close'),
};

const state = {
  overview: null,
  messages: [],
  filter: 'all',
  query: '',
  busy: false,
};

async function fetchJson(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { Accept: 'application/json', ...(options?.headers || {}) },
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `请求失败 (${response.status})`);
  return value;
}

function formatDate(value, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat('zh-CN',
    sameDay
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
  ).format(date);
}

function displaySender(sender) {
  return sender || '未知号码';
}

function senderAvatar(sender) {
  const value = displaySender(sender).replace(/\s/g, '');
  return value.length >= 2 ? value.slice(-2) : value;
}

function renderOverview() {
  const overview = state.overview;
  if (!overview) return;
  const { runtime, inbox } = overview;
  const device = runtime.device || {};

  elements.connectionPill.className = `status-pill ${runtime.connected ? 'status-online' : 'status-offline'}`;
  elements.connectionLabel.textContent = runtime.connected ? 'U8 已连接' : 'U8 离线';
  elements.errorBanner.hidden = !runtime.lastError;
  elements.errorBanner.textContent = runtime.lastError
    ? `暂时无法同步 U8：${runtime.lastError}。历史短信仍可查看。`
    : '';
  elements.unreadCount.textContent = String(inbox.unread);
  elements.totalCount.textContent = String(inbox.total);
  elements.deviceUnreadCount.textContent = device.smsUnreadLong ?? '—';
  elements.networkName.textContent = device.networkName || '—';
  elements.deviceName.textContent = device.deviceName || 'FM U8';
  elements.chipName.textContent = device.mainChip || '—';
  elements.lastSync.textContent = formatDate(runtime.lastSyncAt);
  elements.readAllButton.disabled = inbox.unread === 0;
}

function matchesSearch(message) {
  if (!state.query) return true;
  const haystack = `${message.from}\n${message.subject}`.toLocaleLowerCase('zh-CN');
  return haystack.includes(state.query);
}

function renderMessages() {
  const visible = state.messages.filter((message) => {
    if (state.filter === 'unread' && message.readAt) return false;
    return matchesSearch(message);
  });

  elements.messageList.replaceChildren();
  for (const message of visible) {
    const fragment = elements.messageTemplate.content.cloneNode(true);
    const item = fragment.querySelector('.message-item');
    item.dataset.id = message.id;
    item.classList.toggle('unread', !message.readAt);
    fragment.querySelector('.sender-avatar').textContent = senderAvatar(message.from);
    fragment.querySelector('.message-sender').textContent = displaySender(message.from);
    fragment.querySelector('.message-time').textContent = formatDate(
      message.receivedAt || message.firstSeenAt,
    );
    fragment.querySelector('.message-preview').textContent = message.subject || '（空短信）';
    elements.messageList.append(fragment);
  }
  elements.emptyState.hidden = visible.length > 0;
}

async function loadData() {
  const [overview, inbox] = await Promise.all([
    fetchJson('/api/overview'),
    fetchJson('/api/messages'),
  ]);
  state.overview = overview;
  state.messages = inbox.messages;
  renderOverview();
  renderMessages();
}

async function runAction(action) {
  if (state.busy) return;
  state.busy = true;
  elements.syncButton.disabled = true;
  try {
    await action();
    await loadData();
  } catch (error) {
    elements.errorBanner.hidden = false;
    elements.errorBanner.textContent = error.message;
  } finally {
    state.busy = false;
    elements.syncButton.disabled = false;
  }
}

async function openMessage(id) {
  const message = state.messages.find((item) => item.id === id);
  if (!message) return;
  elements.dialogSender.textContent = displaySender(message.from);
  elements.dialogTime.textContent = formatDate(message.receivedAt || message.firstSeenAt);
  elements.dialogContent.textContent = message.subject || '（空短信）';
  elements.dialog.showModal();

  if (!message.readAt) {
    message.readAt = new Date().toISOString();
    renderMessages();
    await runAction(() => fetchJson(`/api/messages/${id}/read`, { method: 'POST' }));
  }
}

elements.messageList.addEventListener('click', (event) => {
  const item = event.target.closest('.message-item');
  if (item) openMessage(item.dataset.id);
});

elements.searchInput.addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLocaleLowerCase('zh-CN');
  renderMessages();
});

document.querySelectorAll('.filter-tab').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.classList.toggle('active', tab === button);
    });
    renderMessages();
  });
});

elements.syncButton.addEventListener('click', () =>
  runAction(() => fetchJson('/api/sync', { method: 'POST' })),
);
elements.readAllButton.addEventListener('click', () =>
  runAction(() => fetchJson('/api/messages/read-all', { method: 'POST' })),
);
elements.dialogClose.addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});

loadData().catch((error) => {
  elements.errorBanner.hidden = false;
  elements.errorBanner.textContent = `本地服务暂不可用：${error.message}`;
});

setInterval(() => {
  if (!document.hidden && !state.busy) loadData().catch(() => {});
}, 10_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !state.busy) loadData().catch(() => {});
});
