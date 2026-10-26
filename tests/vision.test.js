'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { attachScreen } = require('../src/main/vision');
const messages = [{ role: 'system', content: 'Capri' }, { role: 'user', content: '¿Qué ves?' }];
function options(provider = 'ollama') {
  return { provider, displayId: 7, signal: new AbortController().signal, capturer: { getSources: async () => [
    { display_id: '8', thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from('wrong') } },
    { display_id: '7', thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from('selected') } },
  ] } };
}
test('Ollama gets the selected screen without mutating history', async () => {
  const original = JSON.stringify(messages);
  const sent = await attachScreen(messages, options());
  assert.equal(sent[1].images[0], Buffer.from('selected').toString('base64'));
  assert.match(sent[0].content, /untrusted/);
  assert.equal(JSON.stringify(messages), original);
});
test('compatible providers get image_url content', async () => {
  const sent = await attachScreen(messages, options('custom'));
  assert.equal(sent[1].content[0].text, '¿Qué ves?');
  assert.match(sent[1].content[1].image_url.url, /^data:image\/jpeg;base64,/);
});
test('unsupported provider does not capture and cancelled requests do not attach', async () => {
  const opts = options('claude');
  opts.capturer.getSources = () => { throw new Error('Unexpected capture'); };
  await assert.rejects(attachScreen(messages, opts), /requiere Ollama/);
  await assert.rejects(attachScreen(messages, { ...options(), signal: AbortSignal.abort() }), /stopped/);
});
test('missing selected monitor does not capture a different screen', async () => {
  await assert.rejects(attachScreen(messages, { ...options(), displayId: 99 }), /pantalla seleccionada/);
});
