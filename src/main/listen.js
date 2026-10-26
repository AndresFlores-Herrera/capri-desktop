'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
let current = null;
function stop() { current?.cancel(); }

function listen(lang, onReady = () => {}) {
  stop();
  if (process.platform !== 'win32') return Promise.resolve({ error: 'El reconocimiento local está disponible en Windows.' });
  const script = fs.readFileSync(path.join(__dirname, 'listen.ps1'), 'utf8');
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let finished = false;
    let buffer = '';
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (current === operation) current = null;
      child.kill();
      resolve(result);
    };
    const operation = { cancel: () => finish({ cancelled: true }) };
    const timer = setTimeout(() => finish({ error: 'La escucha terminó. Volvé a tocar el micrófono para intentar de nuevo.' }), 30000);
    current = operation;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (!line) continue;
        try {
          const result = JSON.parse(line);
          if (result.ready) onReady();
          else finish(typeof result.text === 'string' ? { text: result.text.slice(0, 500) } : { error: result.error || 'No se reconoció la voz.' });
        } catch { finish({ error: 'No se pudo interpretar el resultado del micrófono.' }); }
      }
    });
    child.on('error', () => finish({ error: 'No se pudo iniciar el reconocimiento de voz de Windows.' }));
    child.on('close', () => finish({ error: 'El reconocimiento se cerró sin una transcripción.' }));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ lang: String(lang || 'es').split('-')[0] }));
  });
}
module.exports = { listen, stop };
