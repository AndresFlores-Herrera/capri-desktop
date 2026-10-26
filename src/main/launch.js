'use strict';

// Opening things when you ask her to (chat.js): an app from the Start menu (Store apps like Spotify
// included), a Steam or Epic game, your music (the media keys: pause, next…, so it works with
// Spotify and most players), a Spotify search, or a website. Windows only.

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { shell } = require('electron');
const { powershell } = require('./apps');
const config = require('./config');

const WIN = process.platform === 'win32';
// not things to open from a chat: uninstallers, help pages and the like
const SKIP = /uninstall|désinstaller|desinstalar|deinstall|readme|documentation|release notes|support center|website|manual/i;
const STEAM_SKIP = /redistributable|dedicated server|steamworks/i;
// words that don't tell apps apart ("Roblox Player" is "roblox")
const FILLER = new Set(['player', 'launcher', 'app', 'the', 'for', 'windows', 'desktop', 'client', 'x64', 'x86', 'beta', 'microsoft']);
const CACHE_MS = 10 * 60 * 1000; // installed apps hardly change

let cache = null; // { at, items }
let loading = null;
function invalidate() { cache = null; }
function customApps() {
  return (config.load().launchApps || []).filter((item) => item && typeof item.name === 'string' && typeof item.id === 'string' && path.isAbsolute(item.id) && /\.(exe|lnk)$/i.test(item.id) && fs.existsSync(item.id))
    .map((item) => ({ name: item.name, id: item.id, kind: /\.lnk$/i.test(item.id) ? 'shortcut' : 'exe' }));
}

const plain = (text) => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const words = (text) => plain(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);

// Everything she can open: [{ name, kind: 'app' | 'steam' | 'epic', id }]
async function launchables() {
  if (cache && Date.now() - cache.at < CACHE_MS) return [...customApps(), ...cache.items];
  if (!WIN) return [];
  if (loading) return loading;
  loading = discover().finally(() => { loading = null; });
  return loading;
}

async function discover() {
  const items = [];
  const seen = new Set();
  const add = (item) => {
    const key = words(item.name).join(' ');
    if (!key || SKIP.test(item.name)) return;
    if (seen.has(key)) {
      const previous = items.find((i) => words(i.name).join(' ') === key);
      if (previous) previous.aliases = [...new Set([...(previous.aliases || []), ...(item.aliases || [])])];
      return;
    }
    seen.add(key);
    items.push(item);
  };
  // games first: a game's own entry wins over a shortcut to it
  for (const game of [...steamGames(await steamRoot()), ...epicGames()]) add(game);
  // the Start menu's list is slow the first time (PowerShell starting cold): main.js asks for it early
  const out = await powershell(fs.readFileSync(path.join(__dirname, 'installed-apps.ps1'), 'utf8'), 45000).catch(() => null);
  let rows = [];
  let parsed = false;
  try { rows = [].concat(out ? JSON.parse(out) : []); parsed = Boolean(out); } catch { /* retry next lookup */ }
  for (const item of rows) {
    if (item?.name && item.id && ['app', 'shortcut', 'exe'].includes(item.kind)) add(item);
  }
  if (parsed) cache = { at: Date.now(), items };
  return [...customApps(), ...items];
}

function steamRoot() {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      const found = !err && /SteamPath\s+REG_SZ\s+(.+)/.exec(String(out))?.[1].trim();
      resolve(found ? path.normalize(found) : null);
    });
  });
}

// Steam's games, from the manifests in each of its libraries
function steamGames(root) {
  if (!root) return [];
  const libraries = new Set([root]);
  try {
    const vdf = fs.readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libraries.add(path.normalize(m[1].replace(/\\\\/g, '\\')));
  } catch {
    // one library, the main one
  }
  const games = [];
  for (const library of libraries) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(library, 'steamapps')).filter((f) => /^appmanifest_\d+\.acf$/.test(f));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const acf = fs.readFileSync(path.join(library, 'steamapps', file), 'utf8');
        const id = /"appid"\s+"(\d+)"/.exec(acf)?.[1];
        const name = /"name"\s+"([^"]+)"/.exec(acf)?.[1];
        if (id && name && !STEAM_SKIP.test(name)) games.push({ name, kind: 'steam', id });
      } catch {
        // a manifest being written: skip it
      }
    }
  }
  return games;
}

// Epic's games, from its launcher's manifests (not the Unreal Engine plugins it also keeps there)
function epicGames() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.item'));
  } catch {
    return [];
  }
  const games = [];
  for (const file of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (m.bIsIncompleteInstall || m.CatalogNamespace === 'ue' || !m.DisplayName || !m.AppName) continue;
      games.push({ name: m.DisplayName, kind: 'epic', id: `${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}` });
    } catch {
      // not one of its manifests
    }
  }
  return games;
}

// The one of `items` named in `text` (your message, or the name in her tag): all the words of its
// name in it, else at least half of them; the closest wins. null if nothing fits well enough.
function match(items, text) {
  const said = new Set(words(text));
  const ranked = [];
  for (const item of items) {
    let rank = 0;
    for (const name of [item.name, ...(item.aliases || []), ...knownAliases(item.name)]) {
      const key = words(name).filter((w) => !FILLER.has(w) && !/^20\d{2}$/.test(w));
      if (!key.length) continue;
      const hits = key.filter((w) => said.has(w));
      const compact = key.join('');
      const exact = words(text).join('') === words(name).join('');
      const complete = hits.length === key.length || (said.has(compact) && compact.length >= 3);
      if (!complete && (hits.length < 2 || hits.length / key.length < 0.75)) continue;
      rank = Math.max(rank, (exact ? 100 : complete ? 50 : 20) + hits.join('').length / 100);
    }
    if (rank) ranked.push({ item, rank });
  }
  ranked.sort((a, b) => b.rank - a.rank);
  if (!ranked.length) return null;
  if (ranked[1] && Math.abs(ranked[0].rank - ranked[1].rank) < 0.01 && plain(ranked[0].item.name) !== plain(ranked[1].item.name)) return null;
  return ranked[0].item;
}

function knownAliases(name) {
  const groups = [
    ['visual studio code', 'vs code', 'vscode'], ['google chrome', 'chrome'],
    ['microsoft edge', 'edge'], ['mozilla firefox', 'firefox'],
    ['microsoft word', 'word'], ['microsoft excel', 'excel'],
    ['microsoft powerpoint', 'powerpoint'], ['notepad', 'bloc de notas'],
    ['calculator', 'calculadora'], ['file explorer', 'explorador de archivos'],
  ];
  return groups.find((group) => group.includes(words(name).join(' '))) || [];
}

async function find(text) {
  const item = match(await launchables(), text);
  if (item) return item;
  invalidate();
  return match(await launchables(), text);
}

// Opens one of them (only something she listed herself): a Start menu app through its AppsFolder
// entry (desktop and Store apps alike), a game through its launcher's link.
async function launch({ kind, id } = {}) {
  const item = (await launchables()).find((i) => i.kind === kind && i.id === id);
  if (!item) throw new Error('not found');
  if (kind === 'steam') return shell.openExternal(`steam://rungameid/${id}`);
  if (kind === 'epic') return shell.openExternal(`com.epicgames.launcher://apps/${encodeURIComponent(id)}?action=launch&silent=true`);
  if (kind === 'exe' || kind === 'shortcut') {
    const error = await shell.openPath(item.id);
    if (error) throw new Error(error);
    return;
  }
  await new Promise((resolve, reject) => {
    const child = spawn('explorer.exe', [`shell:AppsFolder\\${item.id}`], { detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return undefined;
}

// The media keys, as if pressed on the keyboard: whatever plays music (Spotify, a browser…) reacts.
// Play and pause are the same key; the volume moves a few steps at a time.
const MEDIA = { pause: [179, 1], play: [179, 1], next: [176, 1], previous: [177, 1], volup: [175, 5], voldown: [174, 5], mute: [173, 1] };

async function media(action) {
  if (!WIN || !MEDIA[action]) return false;
  const [key, times] = MEDIA[action];
  return powershell(`$w = New-Object -ComObject WScript.Shell; 1..${times} | ForEach-Object { $w.SendKeys([string][char]${key}) }`)
    .then(() => true, () => false);
}

// A Spotify search for it: in the app if it's installed, else on the web.
async function music(query) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return false;
  try {
    await shell.openExternal(`spotify:search:${encodeURIComponent(q)}`);
  } catch {
    await shell.openExternal(`https://open.spotify.com/search/${encodeURIComponent(q)}`);
  }
  return true;
}

// A website: http or https, with a real host name.
function siteUrl(address) {
  try {
    const url = new URL(/^https?:\/\//i.test(address) ? address : `https://${address}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

async function site(address) {
  const url = siteUrl(String(address || '').trim());
  if (!url) return false;
  await shell.openExternal(url.toString());
  return true;
}

module.exports = { launchables, match, find, launch, media, music, site, siteUrl, invalidate };
