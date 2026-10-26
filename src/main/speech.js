'use strict';
const { spawn } = require('node:child_process');
const { safeStorage } = require('electron');
// Text is passed as JSON on stdin, never as executable PowerShell.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($speaker.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq $request.lang })
  $female = @($voices | Where-Object { $_.VoiceInfo.Gender -eq 'Female' })
  if ($female.Count) { $speaker.SelectVoice($female[0].VoiceInfo.Name) }
  elseif ($voices.Count) { $speaker.SelectVoice($voices[0].VoiceInfo.Name) }
  $speaker.Volume = [int]$request.volume
  $speaker.Speak([string]$request.text)
} finally { $speaker.Dispose() }
`;
let active = null;
let pending = null;
function stop() {
  pending?.abort(); pending = null;
  if (active) active.kill();
  active = null;
}
async function speak(request, cfg) {
  stop();
  if (cfg.muted || cfg.speech === false || cfg.volume === 0) return {};
  if (!request || typeof request.text !== 'string') return {};
  const text = request.text.replace(/\[\[[\s\S]*?\]\]/g, '').replace(/[*_`#]/g, '').trim().slice(0, 12000);
  if (!text) return {};
  if (cfg.speechProvider === 'elevenlabs') {
    if (!cfg.elevenKeyEncrypted || !cfg.elevenVoice) throw new Error('Configurá la API key y el Voice ID en Voz → Configurar ElevenLabs.');
    const controller = new AbortController(); pending = controller;
    try {
      const key = safeStorage.decryptString(Buffer.from(cfg.elevenKeyEncrypted, 'base64'));
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.elevenVoice)}`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
      });
      if (!response.ok) throw new Error(`ElevenLabs respondió ${response.status}. Revisá la clave, la voz y el saldo.`);
      const audio = Buffer.from(await response.arrayBuffer()).toString('base64');
      return controller.signal.aborted ? {} : { audio };
    } catch (err) { if (controller.signal.aborted) return {}; throw err; }
    finally { if (pending === controller) pending = null; }
  }
  if (process.platform !== 'win32') return {};
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  active = child;
  let error = '';
  child.stderr.on('data', (data) => { error = (error + data).slice(-2000); });
  child.on('error', (err) => console.warn('[capri] speech:', err.message));
  child.stdin.on('error', () => {});
  child.on('close', (code) => { if (active !== child) return; active = null; if (code) console.warn('[capri] speech unavailable:', error); });
  const volume = Number.isFinite(cfg.volume) ? cfg.volume : 0.7;
  child.stdin.end(JSON.stringify({ text, lang: String(cfg.lang || 'es').split('-')[0], volume: Math.round(Math.max(0, Math.min(1, volume)) * 100) }));
  return {};
}
module.exports = { speak, stop };
