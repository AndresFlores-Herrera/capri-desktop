'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function backend() {
  const children = [];
  const context = { module: { exports: {} }, __dirname: path.resolve(__dirname, '../src/main'), process: { platform: 'win32' }, Buffer, setTimeout, clearTimeout,
    require: (id) => {
      if (id !== 'node:child_process') return require(id);
      return { spawn: (_command, _args, options) => {
        assert.equal(options.windowsHide, true);
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
        child.stdin = new EventEmitter(); child.stdin.end = (text) => { child.input = JSON.parse(text); };
        child.kill = () => { child.killed = true; };
        children.push(child);
        return child;
      } };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/listen.js'), 'utf8'), context);
  return { api: context.module.exports, children };
}
test('recognition handles readiness, chunked JSON and Spanish text', async () => {
  const { api, children } = backend(); let ready = 0;
  const result = api.listen('es-SV', () => ready++);
  const child = children[0];
  assert.equal(child.input.lang, 'es');
  child.stdout.emit('data', '{"ready":true}\r\n{"text":"Abrí ');
  child.stdout.emit('data', 'Discord"}\r\n');
  assert.equal((await result).text, 'Abrí Discord');
  assert.equal(ready, 1);
  assert.equal(child.killed, true);
});
test('stop cancels and kills the microphone process', async () => {
  const { api, children } = backend();
  const result = api.listen('es'); api.stop();
  assert.equal((await result).cancelled, true);
  assert.equal(children[0].killed, true);
});
test('a second session cancels the first', async () => {
  const { api } = backend();
  const first = api.listen('es'); const second = api.listen('es');
  assert.equal((await first).cancelled, true);
  api.stop(); await second;
});
test('recognizer failures return an error and clean up', async () => {
  const { api, children } = backend();
  const result = api.listen('es'); children[0].emit('error', new Error('failed'));
  assert.match((await result).error, /iniciar/);
  assert.equal(children[0].killed, true);
});

function frontend() {
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/js/dictation.js'), 'utf8').replace('export class Dictation', 'class Dictation');
  const context = { window: { addEventListener() {} } };
  vm.runInNewContext(source + '\nglobalThis.Dictation = Dictation;', context);
  let finish; let stopped = 0; let listens = 0;
  const panel = { current: { chat: {} }, place() {}, chatInput: { value: 'Hola', maxLength: 500, focus() {} }, micStatus: {}, chatMic: { addEventListener() {}, setAttribute() {} } };
  const host = { onMicrophoneReady() {}, stopListening: () => stopped++, listen: () => { listens++; return new Promise((resolve) => { finish = resolve; }); } };
  const dictation = new context.Dictation({ panel, host, voice: { stopSpeech() {} } });
  return { dictation, panel, finish: (result) => finish(result), stopped: () => stopped, listens: () => listens };
}
test('dictation appends editable text without sending a message', async () => {
  const { dictation, panel, finish } = frontend();
  const result = dictation.toggle(); finish({ text: 'abrí Discord' }); await result;
  assert.equal(panel.chatInput.value, 'Hola abrí Discord');
  assert.equal(dictation.active, false);
  assert.match(panel.micStatus.textContent, /Revisá/);
});
test('cancelled or replaced chats ignore late transcriptions', async () => {
  const { dictation, panel, finish, stopped } = frontend();
  const result = dictation.toggle(); panel.onMicCancel(); finish({ text: 'old words' }); await result;
  assert.equal(panel.chatInput.value, 'Hola'); assert.equal(stopped(), 1);
});
test('secret inputs and busy chats cannot start the microphone', async () => {
  const { dictation, panel, listens } = frontend();
  panel.current.chat.secret = true; await dictation.toggle();
  panel.current.chat.secret = false; panel.chatInput.disabled = true; await dictation.toggle();
  assert.equal(listens(), 0);
});
