'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function harness(fetch) {
  const context = { module: { exports: {} }, Buffer, AbortController, AbortSignal, console, process: { platform: 'win32' }, fetch,
    require: (id) => {
      if (id === 'electron') return { safeStorage: { decryptString: () => 'test-secret' } };
      if (id === 'node:child_process') return { spawn: () => { throw new Error('Unexpected local speech'); } };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/speech.js'), 'utf8'), context);
  return context.module.exports;
}
const cfg = { speechProvider: 'elevenlabs', elevenKeyEncrypted: 'ZW5jcnlwdGVk', elevenVoice: 'voice123', volume: 0.7 };
test('mute, disabled speech and zero volume never contact the provider', async () => {
  const speech = harness(() => { throw new Error('Unexpected network'); });
  for (const patch of [{ muted: true }, { speech: false }, { volume: 0 }]) await speech.speak({ text: 'Hola' }, { ...cfg, ...patch });
});
test('sends clean text with private authentication and returns audio', async () => {
  let call;
  const speech = harness(async (url, options) => { call = { url, options }; return { ok: true, arrayBuffer: async () => Buffer.from('mp3') }; });
  const result = await speech.speak({ text: '**Hola** [[open: app]]' }, cfg);
  assert.equal(result.audio, Buffer.from('mp3').toString('base64'));
  assert.equal(call.url, 'https://api.elevenlabs.io/v1/text-to-speech/voice123');
  assert.equal(call.options.headers['xi-api-key'], 'test-secret');
  assert.equal(JSON.parse(call.options.body).text, 'Hola');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});
test('cancellation suppresses late audio', async () => {
  let finish;
  const speech = harness(() => new Promise((resolve) => { finish = resolve; }));
  const result = speech.speak({ text: 'Hola' }, cfg);
  speech.stop();
  finish({ ok: true, arrayBuffer: async () => Buffer.from('old audio') });
  assert.equal((await result).audio, undefined);
});
test('missing voice and authentication failures are actionable', async () => {
  const speech = harness(async () => ({ ok: false, status: 401 }));
  await assert.rejects(speech.speak({ text: 'Hola' }, cfg), /401/);
  await assert.rejects(speech.speak({ text: 'Hola' }, { ...cfg, elevenVoice: '' }), /Voice ID/);
});
