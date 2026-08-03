import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInboxRequestXml,
  decodeUcs2Hex,
  parseMessagesXml,
  parseStatusXml,
} from '../src/xml.js';

test('decodes U8 UCS-2 hexadecimal values', () => {
  assert.equal(decodeUcs2Hex('4f60597d'), '你好');
  assert.equal(decodeUcs2Hex('002b003100320033'), '+123');
  assert.equal(decodeUcs2Hex('not-hex'), 'not-hex');
});

test('parses status counters and device details', () => {
  const xml = `<RGW><sysinfo><device_name>FM_U8</device_name>
    <version_num>FW_1</version_num><hardware_version>V2.0</hardware_version>
    <model_name>LV01</model_name><main_chip_name>PXA1802</main_chip_name>
    <ssg_version>LV01MVL01</ssg_version></sysinfo><wan>
    <network_name>CHN-UNICOM</network_name><cellular><sim_status>0</sim_status></cellular>
    </wan><message><sms_capacity_info><sms_unread_long_num>2</sms_unread_long_num>
    </sms_capacity_info><new_sms_num>0</new_sms_num></message></RGW>`;
  assert.deepEqual(parseStatusXml(xml), {
    deviceName: 'FM_U8',
    firmwareVersion: 'FW_1',
    hardwareVersion: 'V2.0',
    moduleModel: 'LV01',
    mainChip: 'PXA1802',
    basebandVersion: 'LV01MVL01',
    networkName: 'CHN-UNICOM',
    simStatus: '0',
    smsUnreadLong: 2,
    newSms: 0,
  });
});

test('parses an inbox page', () => {
  const xml = `<RGW><message><get_message><page_number>1</page_number>
    <total_number>1</total_number><message_list><Item>
    <index>7</index><from>003b002b0031003200330034</from>
    <subject>4f60597d</subject><received>26,08,03,14,00,00,+8</received>
    <status>0</status><message_type>0</message_type><class_type>0</class_type>
    </Item></message_list></get_message></message></RGW>`;
  assert.deepEqual(parseMessagesXml(xml), {
    page: 1,
    totalPages: 1,
    messages: [
      {
        index: '7',
        from: '+1234',
        subject: '你好',
        received: '26,08,03,14,00,00,+8',
        receivedAt: '2026-08-03T06:00:00.000Z',
        status: '0',
        messageType: '0',
        classType: '0',
      },
    ],
  });
});

test('builds the read-only inbox request', () => {
  const xml = buildInboxRequestXml(3);
  assert.match(xml, /GET_RCV_SMS_LOCAL/);
  assert.match(xml, /<page_number>3<\/page_number>/);
  assert.throws(() => buildInboxRequestXml(0), /Invalid inbox page/);
});
