function decodeXmlEntities(value) {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

export function extractTag(xml, tag) {
  const match = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  );
  return match ? decodeXmlEntities(match[1].trim()) : '';
}

export function decodeUcs2Hex(value) {
  const text = String(value ?? '').trim();
  if (!text || !/^(?:[0-9a-f]{4})+$/i.test(text)) {
    return text;
  }

  const codeUnits = text.match(/[0-9a-f]{4}/gi) ?? [];
  return String.fromCharCode(...codeUnits.map((part) => Number.parseInt(part, 16)));
}

export function parseReceivedAt(value) {
  const match = String(value ?? '').match(
    /^(\d{2}),(\d{2}),(\d{2}),(\d{2}),(\d{2}),(\d{2}),([+-]\d{1,2})$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second, offset] = match;
  const utcMilliseconds =
    Date.UTC(
      2000 + Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ) -
    Number(offset) * 60 * 60 * 1_000;
  const date = new Date(utcMilliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseStatusXml(xml) {
  return {
    deviceName: extractTag(xml, 'device_name'),
    firmwareVersion: extractTag(xml, 'version_num'),
    hardwareVersion: extractTag(xml, 'hardware_version'),
    moduleModel: extractTag(xml, 'model_name'),
    mainChip: extractTag(xml, 'main_chip_name'),
    basebandVersion: extractTag(xml, 'ssg_version'),
    networkName: extractTag(xml, 'network_name'),
    simStatus: extractTag(xml, 'sim_status'),
    smsUnreadLong: Number.parseInt(extractTag(xml, 'sms_unread_long_num'), 10) || 0,
    newSms: Number.parseInt(extractTag(xml, 'new_sms_num'), 10) || 0,
  };
}

function parseMessageItem(itemXml) {
  const raw = {
    index: extractTag(itemXml, 'index'),
    from: extractTag(itemXml, 'from'),
    subject: extractTag(itemXml, 'subject'),
    received: extractTag(itemXml, 'received'),
    status: extractTag(itemXml, 'status'),
    messageType: extractTag(itemXml, 'message_type'),
    classType: extractTag(itemXml, 'class_type'),
  };
  const received = decodeUcs2Hex(raw.received);

  return {
    index: raw.index,
    // The firmware prefixes decoded contact numbers with a semicolon.
    from: decodeUcs2Hex(raw.from).replace(/^;+|;+$/g, ''),
    subject: decodeUcs2Hex(raw.subject),
    received,
    receivedAt: parseReceivedAt(received),
    status: raw.status,
    messageType: raw.messageType,
    classType: raw.classType,
  };
}

export function parseMessagesXml(xml) {
  const listXml = extractTag(xml, 'message_list');
  const itemMatches = [
    ...listXml.matchAll(/<Item(?:\s[^>]*)?>([\s\S]*?)<\/Item>/gi),
  ];

  return {
    page: Number.parseInt(extractTag(xml, 'page_number'), 10) || 1,
    totalPages: Number.parseInt(extractTag(xml, 'total_number'), 10) || 1,
    messages: itemMatches.map((match) => parseMessageItem(match[1])),
  };
}

export function buildInboxRequestXml(page) {
  if (!Number.isInteger(page) || page < 1) {
    throw new Error(`Invalid inbox page: ${page}`);
  }

  return (
    '<?xml version="1.0" encoding="US-ASCII"?>' +
    '<RGW><message><flag>' +
    '<message_flag>GET_RCV_SMS_LOCAL</message_flag>' +
    '</flag><get_message>' +
    `<page_number>${page}</page_number>` +
    '</get_message></message></RGW>'
  );
}
