'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
function setup({ inventory = [], custom = [], openError = '', spawnError = false } = {}) {
  const calls = []; let scans = 0;
  const context = { module: { exports: {} }, __dirname: path.resolve(__dirname, '../src/main'), process: { platform: 'win32', env: {} }, Buffer, URL, console, Date, Set,
    require: (id) => {
      if (id === 'electron') return { shell: { openPath: async (target) => { calls.push(target); return openError; }, openExternal: async (target) => { calls.push(target); } } };
      if (id === './config') return { load: () => ({ launchApps: custom }) };
      if (id === './apps') return { powershell: async () => { scans++; return JSON.stringify(inventory); } };
      if (id === 'node:fs') return { ...fs, existsSync: () => true, readdirSync: () => [] };
      if (id === 'node:child_process') return {
        execFile: (_file, _args, _opts, callback) => callback(new Error('No Steam')),
        spawn: () => {
          const child = new EventEmitter(); child.unref = () => {};
          queueMicrotask(() => child.emit(spawnError ? 'error' : 'spawn', ...(spawnError ? [new Error('Explorer failed')] : [])));
          return child;
        },
      };
      return require(id);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/launch.js'), 'utf8'), context);
  return { api: context.module.exports, calls, scans: () => scans };
}
const apps = [{ name: 'Visual Studio Code', kind: 'app', id: 'code' }, { name: 'Google Chrome', kind: 'exe', id: '/apps/chrome.exe' }, { name: 'Discord', kind: 'shortcut', id: '/apps/discord.lnk' }];
test('recognizes aliases, Spanish requests and office version names', () => {
  const { api } = setup();
  assert.equal(api.match(apps, 'por favor abrí VS Code').id, 'code');
  assert.equal(api.match(apps, 'abrime vscode').id, 'code');
  assert.equal(api.match(apps, 'abrí chrome por favor').id, '/apps/chrome.exe');
  assert.equal(api.match([{ name: 'Microsoft Word 2016' }], 'abrí word').name, 'Microsoft Word 2016');
});
test('avoids substring and ambiguous matches', () => {
  const { api } = setup();
  assert.equal(api.match(apps, 'abrí discordia'), null);
  assert.equal(api.match(apps, 'abrí visual'), null);
  assert.equal(api.match([{ name: 'Foo Client' }, { name: 'Foo Desktop' }], 'abre foo'), null);
});
test('deduplicates while preserving executable aliases', async () => {
  const { api } = setup({ inventory: [...apps, { name: 'Google Chrome', kind: 'exe', id: '/other/chrome.exe', aliases: ['chromium'] }] });
  assert.equal((await api.find('chromium')).id, '/apps/chrome.exe');
  assert.equal((await api.launchables()).length, 3);
});
test('shares concurrent scans and refreshes missed applications', async () => {
  const { api, scans } = setup({ inventory: apps });
  await Promise.all([api.launchables(), api.launchables()]);
  assert.equal(scans(), 1);
  assert.equal(await api.find('missing program'), null);
  assert.equal(scans(), 2);
});
test('opens discovered paths but rejects injected executable paths', async () => {
  const { api, calls } = setup({ inventory: apps });
  await api.launch({ kind: 'exe', id: '/apps/chrome.exe' });
  assert.equal(calls[0], '/apps/chrome.exe');
  await assert.rejects(api.launch({ kind: 'exe', id: '/unknown/evil.exe' }), /not found/);
  assert.equal(calls.length, 1);
});
test('opens explicitly registered portable apps', async () => {
  const { api, calls } = setup({ custom: [{ name: 'Portable App', id: path.resolve('portable.exe') }] });
  await api.launch(await api.find('portable app'));
  assert.equal(calls[0], path.resolve('portable.exe'));
});
test('propagates native errors', async () => {
  const { api } = setup({ inventory: apps, openError: 'Access denied' });
  await assert.rejects(api.launch({ kind: 'exe', id: '/apps/chrome.exe' }), /Access denied/);
  const failed = setup({ inventory: apps, spawnError: true });
  await assert.rejects(failed.api.launch({ kind: 'app', id: 'code' }), /Explorer failed/);
});
